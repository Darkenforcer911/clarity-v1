create table public.daily_action_outcome_revisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  daily_action_id uuid not null,
  previous_status public.daily_action_status not null,
  previous_completed_at timestamptz,
  previous_completion_time_unknown boolean not null default false,
  previous_rescheduled_for date,
  new_status public.daily_action_status,
  new_completed_at timestamptz,
  new_completion_time_unknown boolean not null default false,
  new_rescheduled_for date,
  correction_note text,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint daily_action_outcome_revisions_action_owner_fkey
    foreign key (daily_action_id, user_id)
    references public.daily_actions(id, user_id),
  constraint daily_action_outcome_revisions_new_status check (
    new_status is null or new_status in ('completed', 'missed')
  ),
  constraint daily_action_outcome_revisions_completion check (
    (
      new_status = 'completed'
      and not (new_completed_at is not null and new_completion_time_unknown)
      and new_rescheduled_for is null
    )
    or (
      new_status is distinct from 'completed'
      and new_completed_at is null
      and not new_completion_time_unknown
      and new_rescheduled_for is null
    )
  ),
  constraint daily_action_outcome_revisions_note_length check (
    correction_note is null or char_length(correction_note) <= 500
  )
);

create index daily_action_outcome_revisions_action_idx
  on public.daily_action_outcome_revisions (
    daily_action_id,
    recorded_at desc,
    id desc
  );

create index daily_action_outcome_revisions_user_recorded_idx
  on public.daily_action_outcome_revisions (user_id, recorded_at desc);

alter table public.daily_action_outcome_revisions enable row level security;
alter table public.daily_action_outcome_revisions force row level security;

create policy "Users can read their own Daily Action outcome revisions"
on public.daily_action_outcome_revisions
for select
to authenticated
using ((select auth.uid()) = user_id);

revoke all on table public.daily_action_outcome_revisions
from public, anon, authenticated;
grant select on table public.daily_action_outcome_revisions
to authenticated;

create function public.correct_historical_daily_action_outcome(
  p_daily_action_id uuid,
  p_new_status public.daily_action_status default null,
  p_completed_time time without time zone default null,
  p_correction_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_action public.daily_actions%rowtype;
  v_plan public.daily_plans%rowtype;
  v_latest public.daily_action_outcome_revisions%rowtype;
  v_timezone text;
  v_previous_status public.daily_action_status;
  v_previous_completed_at timestamptz;
  v_previous_completion_time_unknown boolean;
  v_previous_rescheduled_for date;
  v_new_completed_at timestamptz;
  v_new_completion_time_unknown boolean := false;
  v_revision_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_action
  from public.daily_actions
  where id = p_daily_action_id
    and user_id = v_user_id
  for update;

  if v_action.id is null then
    raise exception 'Historical Action not found';
  end if;

  select *
  into v_plan
  from public.daily_plans
  where id = v_action.daily_plan_id
    and user_id = v_user_id
  for update;

  if v_plan.id is null
    or v_plan.status <> 'closed'
    or v_action.approved_at is null
    or v_action.status in ('proposed', 'active')
    or v_action.completion_evidence_only
  then
    raise exception 'Only a planned Action on a closed historical day can be corrected';
  end if;

  select timezone
  into v_timezone
  from public.profiles
  where id = v_user_id;

  if v_timezone is null then
    raise exception 'Profile timezone not found';
  end if;

  if v_plan.local_date >= (clock_timestamp() at time zone v_timezone)::date then
    raise exception 'Only a past-day Action can be corrected here';
  end if;

  if p_new_status is not null
    and p_new_status not in ('completed', 'missed')
  then
    raise exception 'Choose a supported historical Action outcome';
  end if;

  if p_correction_note is not null
    and char_length(p_correction_note) > 500
  then
    raise exception 'Correction note is too long';
  end if;

  if p_new_status = 'completed' then
    if p_completed_time is null then
      v_new_completion_time_unknown := true;
    else
      v_new_completed_at :=
        (v_plan.local_date + p_completed_time) at time zone v_timezone;
    end if;
  elsif p_completed_time is not null then
    raise exception 'Completion time applies only to a completed Action';
  end if;

  select *
  into v_latest
  from public.daily_action_outcome_revisions
  where daily_action_id = v_action.id
    and user_id = v_user_id
  order by recorded_at desc, id desc
  limit 1;

  if v_latest.id is not null and v_latest.new_status is not null then
    v_previous_status := v_latest.new_status;
    v_previous_completed_at := v_latest.new_completed_at;
    v_previous_completion_time_unknown :=
      v_latest.new_completion_time_unknown;
    v_previous_rescheduled_for := v_latest.new_rescheduled_for;
  else
    v_previous_status := v_action.status;
    v_previous_completed_at := v_action.completed_at;
    v_previous_completion_time_unknown :=
      v_action.completion_time_unknown;
    v_previous_rescheduled_for := v_action.rescheduled_for;
  end if;

  insert into public.daily_action_outcome_revisions (
    user_id,
    daily_action_id,
    previous_status,
    previous_completed_at,
    previous_completion_time_unknown,
    previous_rescheduled_for,
    new_status,
    new_completed_at,
    new_completion_time_unknown,
    new_rescheduled_for,
    correction_note
  )
  values (
    v_user_id,
    v_action.id,
    v_previous_status,
    v_previous_completed_at,
    v_previous_completion_time_unknown,
    v_previous_rescheduled_for,
    p_new_status,
    v_new_completed_at,
    v_new_completion_time_unknown,
    null,
    nullif(btrim(p_correction_note), '')
  )
  returning id into v_revision_id;

  update public.profiles
  set last_active_at = clock_timestamp()
  where id = v_user_id;

  return v_revision_id;
end;
$$;

create function public.get_historical_daily_action_outcomes_for_date(
  p_local_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select coalesce(
    jsonb_agg(to_jsonb(latest_revision) order by latest_revision.daily_action_id),
    '[]'::jsonb
  )
  into v_result
  from (
    select distinct on (revision.daily_action_id)
      revision.id,
      revision.daily_action_id,
      revision.new_status,
      revision.new_completed_at,
      revision.new_completion_time_unknown,
      revision.new_rescheduled_for,
      revision.correction_note,
      revision.recorded_at
    from public.daily_action_outcome_revisions as revision
    join public.daily_actions as action
      on action.id = revision.daily_action_id
      and action.user_id = v_user_id
    join public.daily_plans as plan
      on plan.id = action.daily_plan_id
      and plan.user_id = v_user_id
    where revision.user_id = v_user_id
      and plan.local_date = p_local_date
    order by
      revision.daily_action_id,
      revision.recorded_at desc,
      revision.id desc
  ) as latest_revision;

  return v_result;
end;
$$;

alter table public.calendar_commitment_occurrence_revisions
  drop constraint calendar_occurrence_revisions_type,
  add constraint calendar_occurrence_revisions_type check (
    correction_type in (
      'undo_completion',
      'record_after_correction',
      'correct_outcome'
    )
  );

create function public.correct_calendar_event_occurrence_outcome(
  p_calendar_commitment_id uuid,
  p_occurrence_date date,
  p_new_outcome public.calendar_event_outcome default null,
  p_completed_time time without time zone default null,
  p_outcome_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_commitment public.calendar_commitments%rowtype;
  v_occurrence public.calendar_commitment_occurrences%rowtype;
  v_timezone text;
  v_now timestamptz := clock_timestamp();
  v_completed_at timestamptz;
  v_note text := nullif(btrim(p_outcome_note), '');
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_commitment
  from public.calendar_commitments
  where id = p_calendar_commitment_id
    and user_id = v_user_id
  for update;

  if v_commitment.id is null
    or v_commitment.commitment_type <> 'event'
  then
    raise exception 'Historical Calendar occurrence not found';
  end if;

  select timezone
  into v_timezone
  from public.profiles
  where id = v_user_id;

  if v_timezone is null then
    raise exception 'Profile timezone not found';
  end if;

  if p_occurrence_date >= (v_now at time zone v_timezone)::date then
    raise exception 'Only a past Calendar occurrence can be corrected here';
  end if;

  if not private.calendar_commitment_occurs_on_date(
    v_commitment.local_date,
    v_commitment.recurrence,
    p_occurrence_date
  ) then
    raise exception 'Calendar event does not occur on this date';
  end if;

  if p_new_outcome = 'rescheduled' then
    raise exception 'Historical rescheduling requires a confirmed replacement commitment';
  end if;

  if p_outcome_note is not null and char_length(p_outcome_note) > 1000 then
    raise exception 'Outcome note is too long';
  end if;

  if p_new_outcome = 'attended' then
    if p_completed_time is not null then
      v_completed_at :=
        (p_occurrence_date + p_completed_time) at time zone v_timezone;
    end if;
  elsif p_completed_time is not null then
    raise exception 'Completion time applies only to a completed occurrence';
  end if;

  select *
  into v_occurrence
  from public.calendar_commitment_occurrences
  where calendar_commitment_id = v_commitment.id
    and user_id = v_user_id
    and occurrence_date = p_occurrence_date
  for update;

  if v_occurrence.id is null then
    insert into public.calendar_commitment_occurrences (
      user_id,
      calendar_commitment_id,
      occurrence_date,
      outcome,
      outcome_note,
      replacement_commitment_id,
      recorded_at,
      completed_at
    )
    values (
      v_user_id,
      v_commitment.id,
      p_occurrence_date,
      null,
      null,
      null,
      v_now,
      null
    )
    returning * into v_occurrence;
  end if;

  if v_occurrence.outcome is not distinct from p_new_outcome
    and v_occurrence.completed_at is not distinct from v_completed_at
    and v_occurrence.outcome_note is not distinct from v_note
  then
    raise exception 'That outcome is already recorded';
  end if;

  insert into public.calendar_commitment_occurrence_revisions (
    user_id,
    calendar_commitment_occurrence_id,
    correction_type,
    reason,
    previous_outcome,
    previous_outcome_note,
    previous_completed_at,
    previous_recorded_at,
    new_outcome,
    new_outcome_note,
    new_completed_at,
    new_recorded_at
  )
  values (
    v_user_id,
    v_occurrence.id,
    'correct_outcome',
    'User corrected this occurrence outcome.',
    v_occurrence.outcome,
    v_occurrence.outcome_note,
    v_occurrence.completed_at,
    v_occurrence.recorded_at,
    p_new_outcome,
    v_note,
    v_completed_at,
    v_now
  );

  update public.calendar_commitment_occurrences
  set
    outcome = p_new_outcome,
    outcome_note = v_note,
    replacement_commitment_id = null,
    completed_at = v_completed_at,
    recorded_at = v_now
  where id = v_occurrence.id;

  update public.profiles
  set last_active_at = v_now
  where id = v_user_id;

  return v_occurrence.id;
end;
$$;

revoke all on function public.correct_historical_daily_action_outcome(
  uuid,
  public.daily_action_status,
  time without time zone,
  text
) from public, anon, authenticated;
revoke all on function public.get_historical_daily_action_outcomes_for_date(date)
from public, anon, authenticated;
revoke all on function public.correct_calendar_event_occurrence_outcome(
  uuid,
  date,
  public.calendar_event_outcome,
  time without time zone,
  text
) from public, anon, authenticated;

grant execute on function public.correct_historical_daily_action_outcome(
  uuid,
  public.daily_action_status,
  time without time zone,
  text
) to authenticated;
grant execute on function public.get_historical_daily_action_outcomes_for_date(date)
to authenticated;
grant execute on function public.correct_calendar_event_occurrence_outcome(
  uuid,
  date,
  public.calendar_event_outcome,
  time without time zone,
  text
) to authenticated;

notify pgrst, 'reload schema';
