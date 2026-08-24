alter table public.daily_actions
  add column completion_evidence_only boolean not null default false;

alter table public.daily_actions
  drop constraint daily_actions_estimated_minutes_range,
  add constraint daily_actions_estimated_minutes_range check (
    (
      completion_evidence_only
      and status = 'completed'
      and estimated_minutes = 0
    )
    or (
      not completion_evidence_only
      and estimated_minutes between 1 and 1440
    )
  );

create type public.calendar_event_outcome as enum (
  'attended',
  'missed',
  'cancelled',
  'rescheduled'
);

create table public.calendar_commitment_occurrences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  calendar_commitment_id uuid not null
    references public.calendar_commitments(id) on delete cascade,
  occurrence_date date not null,
  outcome public.calendar_event_outcome not null,
  outcome_note text,
  replacement_commitment_id uuid
    references public.calendar_commitments(id) on delete set null,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_commitment_occurrences_unique
    unique (calendar_commitment_id, occurrence_date),
  constraint calendar_commitment_occurrences_note_length check (
    outcome_note is null or char_length(outcome_note) <= 1000
  ),
  constraint calendar_commitment_occurrences_replacement check (
    (outcome = 'rescheduled' and replacement_commitment_id is not null)
    or (outcome <> 'rescheduled' and replacement_commitment_id is null)
  )
);

create index calendar_commitment_occurrences_user_date_idx
  on public.calendar_commitment_occurrences (user_id, occurrence_date);

create trigger calendar_commitment_occurrences_set_updated_at
before update on public.calendar_commitment_occurrences
for each row execute function public.set_updated_at();

alter table public.calendar_commitment_occurrences enable row level security;
alter table public.calendar_commitment_occurrences force row level security;

create policy "Users can read their own calendar occurrence outcomes"
on public.calendar_commitment_occurrences
for select
to authenticated
using ((select auth.uid()) = user_id);

revoke all on table public.calendar_commitment_occurrences
from anon, authenticated;
grant select on table public.calendar_commitment_occurrences
to authenticated;

create function public.create_completed_plan_evidence(
  p_daily_plan_id uuid,
  p_title text,
  p_completed_time time without time zone default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan public.daily_plans%rowtype;
  v_timezone text;
  v_completed_at timestamptz;
  v_recorded_at timestamptz := clock_timestamp();
  v_action_id uuid := gen_random_uuid();
  v_sort_order integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if nullif(btrim(p_title), '') is null
    or char_length(btrim(p_title)) > 200
  then
    raise exception 'Describe what you completed';
  end if;

  select *
  into v_plan
  from public.daily_plans
  where id = p_daily_plan_id
    and user_id = v_user_id
  for update;

  if v_plan.id is null then
    raise exception 'Daily plan not found';
  end if;

  if v_plan.status <> 'proposed' or v_plan.approved_at is not null then
    raise exception 'Completed items can only be added before plan approval';
  end if;

  select timezone
  into v_timezone
  from public.profiles
  where id = v_user_id;

  if v_timezone is null then
    raise exception 'Profile timezone not found';
  end if;

  if v_plan.local_date <> (v_recorded_at at time zone v_timezone)::date then
    raise exception 'Today has changed. Return to Today before adding this item';
  end if;

  if p_completed_time is not null then
    v_completed_at :=
      (v_plan.local_date + p_completed_time) at time zone v_timezone;

    if date_trunc('minute', v_completed_at)
      > date_trunc('minute', v_recorded_at)
    then
      raise exception 'Completion time cannot be in the future';
    end if;
  end if;

  select coalesce(max(sort_order), -1) + 1
  into v_sort_order
  from public.daily_actions
  where daily_plan_id = v_plan.id;

  insert into public.daily_actions (
    id,
    user_id,
    daily_plan_id,
    title,
    action_type,
    status,
    estimated_minutes,
    scheduled_time,
    why_it_exists,
    definition_of_done,
    suggested_method,
    sort_order,
    completed_at,
    completion_recorded_at,
    completion_time_unknown,
    completion_evidence_only
  )
  values (
    v_action_id,
    v_user_id,
    v_plan.id,
    btrim(p_title),
    'flexible',
    'completed',
    0,
    null,
    'Recorded by the user as completed evidence.',
    btrim(p_title),
    'Already completed.',
    v_sort_order,
    v_completed_at,
    v_recorded_at,
    v_completed_at is null,
    true
  );

  perform private.touch_profile_and_record_event(
    v_user_id,
    'action_completed',
    jsonb_build_object(
      'dailyPlanId', v_plan.id,
      'dailyActionId', v_action_id,
      'completedEvidenceOnly', true
    )
  );

  return v_action_id;
end;
$$;

create function public.update_completed_plan_evidence(
  p_daily_action_id uuid,
  p_title text,
  p_completed_time time without time zone default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_action public.daily_actions%rowtype;
  v_plan public.daily_plans%rowtype;
  v_timezone text;
  v_completed_at timestamptz;
  v_recorded_at timestamptz := clock_timestamp();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if nullif(btrim(p_title), '') is null
    or char_length(btrim(p_title)) > 200
  then
    raise exception 'Describe what you completed';
  end if;

  select *
  into v_action
  from public.daily_actions
  where id = p_daily_action_id
    and user_id = v_user_id
  for update;

  if v_action.id is null then
    raise exception 'Completed item not found';
  end if;

  select *
  into v_plan
  from public.daily_plans
  where id = v_action.daily_plan_id
    and user_id = v_user_id
  for update;

  if v_plan.status <> 'proposed'
    or v_plan.approved_at is not null
    or v_action.status <> 'completed'
    or not v_action.completion_evidence_only
    or v_action.approved_at is not null
  then
    raise exception 'Only a completed item in the current proposal can be edited';
  end if;

  select timezone
  into v_timezone
  from public.profiles
  where id = v_user_id;

  if v_plan.local_date <> (v_recorded_at at time zone v_timezone)::date then
    raise exception 'Today has changed. Return to Today before editing this item';
  end if;

  if p_completed_time is not null then
    v_completed_at :=
      (v_plan.local_date + p_completed_time) at time zone v_timezone;

    if date_trunc('minute', v_completed_at)
      > date_trunc('minute', v_recorded_at)
    then
      raise exception 'Completion time cannot be in the future';
    end if;
  end if;

  update public.daily_actions
  set
    title = btrim(p_title),
    definition_of_done = btrim(p_title),
    completed_at = v_completed_at,
    completion_recorded_at = v_recorded_at,
    completion_time_unknown = v_completed_at is null
  where id = v_action.id;
end;
$$;

create function public.delete_completed_plan_evidence(
  p_daily_action_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_action public.daily_actions%rowtype;
  v_plan public.daily_plans%rowtype;
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
    raise exception 'Completed item not found';
  end if;

  select *
  into v_plan
  from public.daily_plans
  where id = v_action.daily_plan_id
    and user_id = v_user_id
  for update;

  if v_plan.status <> 'proposed'
    or v_plan.approved_at is not null
    or v_action.status <> 'completed'
    or not v_action.completion_evidence_only
    or v_action.approved_at is not null
  then
    raise exception 'Only a completed item in the current proposal can be removed';
  end if;

  delete from public.daily_actions where id = v_action.id;
end;
$$;

create function public.complete_proposed_action_v2(
  p_daily_action_id uuid,
  p_completed_time time without time zone default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_action public.daily_actions%rowtype;
  v_plan public.daily_plans%rowtype;
  v_timezone text;
  v_completed_at timestamptz;
  v_recorded_at timestamptz := clock_timestamp();
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
    raise exception 'Daily action not found';
  end if;

  select *
  into v_plan
  from public.daily_plans
  where id = v_action.daily_plan_id
    and user_id = v_user_id
  for update;

  if v_plan.status <> 'proposed'
    or v_action.status <> 'proposed'
    or v_action.approved_at is not null
  then
    raise exception 'Only an unfinished action in a proposed plan can be completed';
  end if;

  select timezone
  into v_timezone
  from public.profiles
  where id = v_user_id;

  if v_timezone is null then
    raise exception 'Profile timezone not found';
  end if;

  if v_plan.local_date <> (v_recorded_at at time zone v_timezone)::date then
    raise exception 'Today has changed. Return to Today before completing this action';
  end if;

  if p_completed_time is not null then
    v_completed_at :=
      (v_plan.local_date + p_completed_time) at time zone v_timezone;

    if date_trunc('minute', v_completed_at)
      > date_trunc('minute', v_recorded_at)
    then
      raise exception 'Completion time cannot be in the future';
    end if;
  end if;

  update public.daily_actions
  set
    status = 'completed',
    completed_at = v_completed_at,
    completion_recorded_at = v_recorded_at,
    completion_time_unknown = v_completed_at is null,
    rescheduled_for = null,
    resolution_note = null
  where id = v_action.id;

  perform private.touch_profile_and_record_event(
    v_user_id,
    'action_completed',
    jsonb_build_object(
      'dailyPlanId', v_plan.id,
      'dailyActionId', v_action.id,
      'completedFromProposal', true
    )
  );
end;
$$;

create function public.record_calendar_event_outcome(
  p_calendar_commitment_id uuid,
  p_occurrence_date date,
  p_outcome public.calendar_event_outcome,
  p_outcome_note text default null,
  p_new_date date default null,
  p_new_time time without time zone default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_commitment public.calendar_commitments%rowtype;
  v_timezone text;
  v_now timestamptz := clock_timestamp();
  v_local_date date;
  v_occurs boolean;
  v_replacement_id uuid;
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

  if v_commitment.id is null then
    raise exception 'Calendar event not found';
  end if;

  if v_commitment.commitment_type <> 'event'
    or v_commitment.status <> 'scheduled'
  then
    raise exception 'Only an unresolved Calendar event can be reconciled';
  end if;

  select timezone
  into v_timezone
  from public.profiles
  where id = v_user_id;

  if v_timezone is null then
    raise exception 'Profile timezone not found';
  end if;

  v_local_date := (v_now at time zone v_timezone)::date;

  if p_occurrence_date <> v_local_date then
    raise exception 'Only an event on the current plan date can be reconciled';
  end if;

  v_occurs :=
    v_commitment.local_date <= p_occurrence_date
    and (
      (v_commitment.recurrence = 'none' and v_commitment.local_date = p_occurrence_date)
      or v_commitment.recurrence = 'daily'
      or (
        v_commitment.recurrence = 'weekly'
        and (p_occurrence_date - v_commitment.local_date) % 7 = 0
      )
      or (
        v_commitment.recurrence = 'fortnightly'
        and (p_occurrence_date - v_commitment.local_date) % 14 = 0
      )
      or (
        v_commitment.recurrence = 'monthly'
        and extract(day from p_occurrence_date)
          = extract(day from v_commitment.local_date)
      )
    );

  if not v_occurs then
    raise exception 'Calendar event does not occur on this date';
  end if;

  if date_trunc(
      'minute',
      (p_occurrence_date + v_commitment.event_start_time)
        at time zone v_timezone
    ) >= date_trunc('minute', v_now)
  then
    raise exception 'The Calendar event time has not passed yet';
  end if;

  if p_outcome_note is not null and char_length(p_outcome_note) > 1000 then
    raise exception 'Outcome note is too long';
  end if;

  if p_outcome = 'rescheduled' then
    if p_new_date is null or p_new_time is null then
      raise exception 'A rescheduled event needs a new date and time';
    end if;

    if date_trunc(
        'minute',
        (p_new_date + p_new_time) at time zone v_timezone
      ) <= date_trunc('minute', v_now)
    then
      raise exception 'The new date and time must be in the future';
    end if;

    insert into public.calendar_commitments (
      user_id,
      commitment_type,
      title,
      local_date,
      event_start_time,
      duration_minutes,
      recurrence,
      details,
      timezone,
      rescheduled_from_id
    )
    values (
      v_user_id,
      'event',
      v_commitment.title,
      p_new_date,
      p_new_time,
      v_commitment.duration_minutes,
      'none',
      v_commitment.details,
      v_timezone,
      v_commitment.id
    )
    returning id into v_replacement_id;
  elsif p_new_date is not null or p_new_time is not null then
    raise exception 'A new date and time only apply to rescheduled events';
  end if;

  insert into public.calendar_commitment_occurrences (
    user_id,
    calendar_commitment_id,
    occurrence_date,
    outcome,
    outcome_note,
    replacement_commitment_id
  )
  values (
    v_user_id,
    v_commitment.id,
    p_occurrence_date,
    p_outcome,
    nullif(btrim(p_outcome_note), ''),
    v_replacement_id
  );

  update public.profiles
  set last_active_at = v_now
  where id = v_user_id;

  return v_replacement_id;
end;
$$;

create or replace function public.get_calendar_commitments_for_date(
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
    jsonb_agg(
      to_jsonb(commitment)
        || jsonb_build_object(
          'occurrence_date', p_local_date,
          'status', case occurrence.outcome
            when 'attended' then 'completed'
            when 'missed' then 'missed'
            when 'cancelled' then 'cancelled'
            when 'rescheduled' then 'cancelled'
            else commitment.status::text
          end,
          'reconciliation_outcome', occurrence.outcome,
          'outcome_note', occurrence.outcome_note,
          'replacement_commitment_id', occurrence.replacement_commitment_id
        )
      order by
        case commitment.commitment_type
          when 'event' then 0
          else 1
        end,
        coalesce(
          commitment.event_start_time,
          commitment.deadline_due_time,
          time '23:59:59'
        ),
        commitment.created_at,
        commitment.id
    ),
    '[]'::jsonb
  )
  into v_result
  from public.calendar_commitments as commitment
  left join public.calendar_commitment_occurrences as occurrence
    on occurrence.calendar_commitment_id = commitment.id
    and occurrence.user_id = v_user_id
    and occurrence.occurrence_date = p_local_date
  where commitment.user_id = v_user_id
    and (
      occurrence.id is not null
      or (
        commitment.status <> 'scheduled'
        and commitment.local_date = p_local_date
      )
      or (
        commitment.status = 'scheduled'
        and commitment.local_date <= p_local_date
        and (
          (
            commitment.recurrence = 'none'
            and commitment.local_date = p_local_date
          )
          or commitment.recurrence = 'daily'
          or (
            commitment.recurrence = 'weekly'
            and (p_local_date - commitment.local_date) % 7 = 0
          )
          or (
            commitment.recurrence = 'fortnightly'
            and (p_local_date - commitment.local_date) % 14 = 0
          )
          or (
            commitment.recurrence = 'monthly'
            and extract(day from p_local_date)
              = extract(day from commitment.local_date)
          )
        )
      )
    );

  return v_result;
end;
$$;

revoke all on function public.create_completed_plan_evidence(uuid, text, time without time zone)
from public, anon, authenticated;
revoke all on function public.update_completed_plan_evidence(uuid, text, time without time zone)
from public, anon, authenticated;
revoke all on function public.delete_completed_plan_evidence(uuid)
from public, anon, authenticated;
revoke all on function public.complete_proposed_action_v2(uuid, time without time zone)
from public, anon, authenticated;
revoke all on function public.record_calendar_event_outcome(uuid, date, public.calendar_event_outcome, text, date, time without time zone)
from public, anon, authenticated;
revoke all on function public.get_calendar_commitments_for_date(date)
from public, anon, authenticated;

grant execute on function public.create_completed_plan_evidence(uuid, text, time without time zone)
to authenticated;
grant execute on function public.update_completed_plan_evidence(uuid, text, time without time zone)
to authenticated;
grant execute on function public.delete_completed_plan_evidence(uuid)
to authenticated;
grant execute on function public.complete_proposed_action_v2(uuid, time without time zone)
to authenticated;
grant execute on function public.record_calendar_event_outcome(uuid, date, public.calendar_event_outcome, text, date, time without time zone)
to authenticated;
grant execute on function public.get_calendar_commitments_for_date(date)
to authenticated;

notify pgrst, 'reload schema';
