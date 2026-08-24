alter table public.calendar_commitment_occurrences
  add column completed_at timestamptz;

alter table public.calendar_commitment_occurrences
  alter column outcome drop not null,
  drop constraint calendar_commitment_occurrences_replacement,
  add constraint calendar_commitment_occurrences_replacement check (
    (outcome is null and replacement_commitment_id is null)
    or (outcome = 'rescheduled' and replacement_commitment_id is not null)
    or (outcome is not null and outcome <> 'rescheduled' and replacement_commitment_id is null)
  ),
  add constraint calendar_commitment_occurrences_completion_time check (
    completed_at is null or outcome = 'attended'
  );

create table public.calendar_commitment_occurrence_revisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  calendar_commitment_occurrence_id uuid not null,
  correction_type text not null,
  reason text not null,
  previous_outcome public.calendar_event_outcome,
  previous_outcome_note text,
  previous_completed_at timestamptz,
  previous_recorded_at timestamptz,
  new_outcome public.calendar_event_outcome,
  new_outcome_note text,
  new_completed_at timestamptz,
  new_recorded_at timestamptz,
  corrected_at timestamptz not null default clock_timestamp(),
  constraint calendar_occurrence_revisions_occurrence_owner_fkey
    foreign key (calendar_commitment_occurrence_id, user_id)
    references public.calendar_commitment_occurrences(id, user_id),
  constraint calendar_occurrence_revisions_type check (
    correction_type in ('undo_completion', 'record_after_correction')
  ),
  constraint calendar_occurrence_revisions_reason_length check (
    char_length(btrim(reason)) between 1 and 500
  ),
  constraint calendar_occurrence_revisions_previous_note_length check (
    previous_outcome_note is null or char_length(previous_outcome_note) <= 1000
  ),
  constraint calendar_occurrence_revisions_new_note_length check (
    new_outcome_note is null or char_length(new_outcome_note) <= 1000
  )
);

create index calendar_occurrence_revisions_occurrence_idx
  on public.calendar_commitment_occurrence_revisions (
    calendar_commitment_occurrence_id,
    corrected_at
  );

create index calendar_occurrence_revisions_user_corrected_idx
  on public.calendar_commitment_occurrence_revisions (
    user_id,
    corrected_at desc
  );

alter table public.calendar_commitment_occurrence_revisions
  enable row level security;
alter table public.calendar_commitment_occurrence_revisions
  force row level security;

create policy "Users can read their own Calendar occurrence revisions"
on public.calendar_commitment_occurrence_revisions
for select
to authenticated
using ((select auth.uid()) = user_id);

revoke all on table public.calendar_commitment_occurrence_revisions
from public, anon, authenticated;
grant select on table public.calendar_commitment_occurrence_revisions
to authenticated;

create or replace function public.record_calendar_event_outcome(
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
  v_occurrence public.calendar_commitment_occurrences%rowtype;
  v_timezone text;
  v_now timestamptz := clock_timestamp();
  v_local_date date;
  v_occurs boolean;
  v_replacement_id uuid;
  v_outcome_note text := nullif(btrim(p_outcome_note), '');
  v_completed_at timestamptz;
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

  if p_outcome is null then
    raise exception 'Choose a Calendar event outcome';
  end if;

  select *
  into v_occurrence
  from public.calendar_commitment_occurrences
  where calendar_commitment_id = v_commitment.id
    and user_id = v_user_id
    and occurrence_date = p_occurrence_date
  for update;

  if v_occurrence.id is not null and v_occurrence.outcome is not null then
    raise exception 'Calendar event outcome already recorded';
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

  if p_outcome = 'attended' then
    v_completed_at := v_now;
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
      reminder_offsets_minutes,
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
      v_commitment.timezone,
      v_commitment.reminder_offsets_minutes,
      v_commitment.id
    )
    returning id into v_replacement_id;
  elsif p_new_date is not null or p_new_time is not null then
    raise exception 'A new date and time only apply to rescheduled events';
  end if;

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
      p_outcome,
      v_outcome_note,
      v_replacement_id,
      v_now,
      v_completed_at
    );
  else
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
      'record_after_correction',
      'User recorded a new outcome after correcting this occurrence.',
      v_occurrence.outcome,
      v_occurrence.outcome_note,
      v_occurrence.completed_at,
      v_occurrence.recorded_at,
      p_outcome,
      v_outcome_note,
      v_completed_at,
      v_now
    );

    update public.calendar_commitment_occurrences
    set
      outcome = p_outcome,
      outcome_note = v_outcome_note,
      replacement_commitment_id = v_replacement_id,
      recorded_at = v_now,
      completed_at = v_completed_at
    where id = v_occurrence.id;
  end if;

  update public.profiles
  set last_active_at = v_now
  where id = v_user_id;

  return v_replacement_id;
end;
$$;

create function public.undo_calendar_event_completion(
  p_calendar_commitment_id uuid,
  p_occurrence_date date
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
  v_now timestamptz := clock_timestamp();
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
    raise exception 'Calendar occurrence not found';
  end if;

  select *
  into v_occurrence
  from public.calendar_commitment_occurrences
  where calendar_commitment_id = v_commitment.id
    and user_id = v_user_id
    and occurrence_date = p_occurrence_date
  for update;

  if v_occurrence.id is null then
    raise exception 'Calendar occurrence not found';
  end if;

  if v_occurrence.outcome is distinct from 'attended' then
    raise exception 'This Calendar occurrence is not completed';
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
    'undo_completion',
    'User corrected this occurrence as not completed.',
    v_occurrence.outcome,
    v_occurrence.outcome_note,
    v_occurrence.completed_at,
    v_occurrence.recorded_at,
    null,
    null,
    null,
    null
  );

  update public.calendar_commitment_occurrences
  set
    outcome = null,
    outcome_note = null,
    replacement_commitment_id = null,
    completed_at = null
  where id = v_occurrence.id;

  update public.profiles
  set last_active_at = v_now
  where id = v_user_id;

  return v_occurrence.id;
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
          'occurrence_id', occurrence.id,
          'status', case occurrence.outcome
            when 'attended' then 'completed'
            when 'missed' then 'missed'
            when 'cancelled' then 'cancelled'
            when 'rescheduled' then 'cancelled'
            else commitment.status::text
          end,
          'reconciliation_outcome', occurrence.outcome,
          'outcome_note', occurrence.outcome_note,
          'outcome_recorded_at', occurrence.recorded_at,
          'completed_at', occurrence.completed_at,
          'replacement_commitment_id', occurrence.replacement_commitment_id,
          'can_undo_completion', occurrence.outcome = 'attended'
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

revoke all on function public.undo_calendar_event_completion(uuid, date)
from public, anon, authenticated;
grant execute on function public.undo_calendar_event_completion(uuid, date)
to authenticated;

notify pgrst, 'reload schema';
