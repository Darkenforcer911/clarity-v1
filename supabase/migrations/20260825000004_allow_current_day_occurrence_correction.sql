create or replace function public.correct_calendar_event_occurrence_outcome(
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

  select * into v_commitment
  from public.calendar_commitments
  where id = p_calendar_commitment_id and user_id = v_user_id
  for update;

  if v_commitment.id is null
    or v_commitment.commitment_type <> 'event'
  then
    raise exception 'Calendar occurrence not found';
  end if;

  select timezone into v_timezone
  from public.profiles where id = v_user_id;
  if v_timezone is null then
    raise exception 'Profile timezone not found';
  end if;
  if p_occurrence_date > (v_now at time zone v_timezone)::date then
    raise exception 'A future Calendar occurrence cannot be corrected';
  end if;

  if not private.calendar_commitment_occurs_on_date(
    v_commitment.local_date,
    v_commitment.recurrence_unit,
    v_commitment.recurrence_interval,
    v_commitment.recurrence_weekdays,
    p_occurrence_date
  ) then
    raise exception 'Calendar event does not occur on this date';
  end if;
  if p_new_outcome = 'rescheduled' then
    raise exception 'Occurrence correction does not reschedule the commitment';
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

  select * into v_occurrence
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
    ) values (
      v_user_id,
      v_commitment.id,
      p_occurrence_date,
      null,
      null,
      null,
      v_now,
      null
    ) returning * into v_occurrence;
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
  ) values (
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

  update public.profiles set last_active_at = v_now
  where id = v_user_id;
  return v_occurrence.id;
end;
$$;

revoke all on function public.correct_calendar_event_occurrence_outcome(
  uuid,
  date,
  public.calendar_event_outcome,
  time without time zone,
  text
) from public, anon, authenticated;
grant execute on function public.correct_calendar_event_occurrence_outcome(
  uuid,
  date,
  public.calendar_event_outcome,
  time without time zone,
  text
) to authenticated;

notify pgrst, 'reload schema';
