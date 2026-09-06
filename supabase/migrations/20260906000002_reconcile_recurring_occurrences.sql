-- Reconcile unaccepted Routine-generated Action occurrences when recurrence
-- changes, and permit an owned future Calendar occurrence to be skipped.

create or replace function private.reconcile_action_recurrence_v1(
  p_user_id uuid,
  p_daily_action_id uuid,
  p_recurrence_pattern text,
  p_recurrence_days smallint[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action public.daily_actions%rowtype;
  v_routine public.routines%rowtype;
  v_timezone text;
  v_today date;
  v_cadence public.routine_cadence;
  v_weekdays smallint[] := '{}';
  v_routine_id uuid;
begin
  if p_user_id is null or p_user_id is distinct from auth.uid() then
    raise exception 'Authentication required';
  end if;

  if p_recurrence_pattern not in ('none', 'daily', 'weekly', 'certain_days')
    or p_recurrence_days is null
    or not (p_recurrence_days <@ array[0,1,2,3,4,5,6]::smallint[])
    or cardinality(p_recurrence_days) > 7
    or cardinality(p_recurrence_days) <> (
      select count(distinct weekday)::integer
      from unnest(p_recurrence_days) as weekday
    )
    or (p_recurrence_pattern = 'certain_days' and cardinality(p_recurrence_days) = 0)
    or (p_recurrence_pattern <> 'certain_days' and cardinality(p_recurrence_days) > 0)
  then
    raise exception 'Action recurrence is invalid';
  end if;

  select action.* into v_action
  from public.daily_actions as action
  where action.id = p_daily_action_id
    and action.user_id = p_user_id
  for update;

  if v_action.id is null then
    raise exception 'Action not found';
  end if;

  select profile.timezone into v_timezone
  from public.profiles as profile
  where profile.id = p_user_id;

  if v_timezone is null then
    raise exception 'Profile timezone not found';
  end if;
  v_today := (clock_timestamp() at time zone v_timezone)::date;

  if v_action.local_date < v_today
    or v_action.status not in ('proposed', 'active', 'completed')
  then
    raise exception 'Only a current or future Action occurrence can change repeat';
  end if;

  v_routine_id := v_action.source_routine_id;

  if v_routine_id is not null then
    select routine.* into v_routine
    from public.routines as routine
    where routine.id = v_routine_id
      and routine.user_id = p_user_id
    for update;

    if v_routine.id is null then
      raise exception 'Repeating Action definition not found';
    end if;

    -- Only pristine, unapproved rows produced by deterministic materialization
    -- are regenerated. Accepted, completed, removed, rescheduled, or edited
    -- dated truth is deliberately preserved.
    delete from public.daily_actions as future_action
    where future_action.user_id = p_user_id
      and future_action.source_routine_id = v_routine.id
      and future_action.local_date > v_action.local_date
      and future_action.status = 'proposed'
      and future_action.approved_at is null
      and not future_action.completion_evidence_only
      and future_action.completed_at is null
      and future_action.completion_recorded_at is null
      and future_action.rescheduled_for is null
      and future_action.resolution_note is null
      and future_action.title = v_routine.title
      and future_action.action_type = case
        when v_routine.preferred_time is null then 'flexible'
        else 'fixed'
      end
      and future_action.estimated_minutes = v_routine.estimated_minutes
      and future_action.scheduled_time is not distinct from case
        when v_routine.preferred_time is null then null
        else (future_action.local_date + v_routine.preferred_time)
          at time zone v_timezone
      end
      and future_action.due_local_date is not distinct from case
        when v_routine.due_offset_days is null then null
        else future_action.local_date + v_routine.due_offset_days
      end
      and future_action.due_local_time is not distinct from v_routine.due_local_time
      and future_action.reminder_offsets_minutes = v_routine.reminder_offsets_minutes
      and future_action.details is not distinct from v_routine.details
      and future_action.why_it_exists = 'This repeating action applies on this date.'
      and future_action.definition_of_done = v_routine.title || ' is complete.'
      and future_action.suggested_method = 'Complete the action as planned.'
      and future_action.original_input = v_routine.title
      and future_action.recurrence_pattern = 'none'
      and cardinality(future_action.recurrence_days) = 0
      and future_action.life_area_id is not distinct from v_routine.life_area_id
      and future_action.goal_id is not distinct from v_routine.goal_id
      and future_action.project_id is not distinct from v_routine.project_id;
  end if;

  if p_recurrence_pattern = 'none' then
    if v_routine_id is not null then
      update public.routines
      set status = 'ended', ended_at = coalesce(ended_at, clock_timestamp())
      where id = v_routine_id
        and user_id = p_user_id
        and status <> 'ended';
    end if;

    update public.daily_actions
    set source_routine_id = null,
        recurrence_pattern = 'none',
        recurrence_days = '{}',
        relationship_source = case
          when num_nonnulls(
            life_area_id,
            goal_id,
            project_id,
            source_calendar_commitment_id
          ) = 0 then null
          else relationship_source
        end
    where id = v_action.id
      and user_id = p_user_id;

    return;
  end if;

  v_cadence := case p_recurrence_pattern
    when 'daily' then 'daily'::public.routine_cadence
    when 'weekly' then 'weekly'::public.routine_cadence
    else 'certain_days'::public.routine_cadence
  end;
  v_weekdays := case
    when p_recurrence_pattern = 'certain_days' then p_recurrence_days
    else '{}'::smallint[]
  end;

  if v_routine_id is null then
    insert into public.routines (
      user_id,
      life_area_id,
      title,
      status,
      cadence,
      weekdays,
      estimated_minutes,
      preferred_time,
      skip_policy,
      created_via,
      start_on,
      details,
      due_offset_days,
      due_local_time,
      reminder_offsets_minutes,
      goal_id,
      project_id
    ) values (
      p_user_id,
      v_action.life_area_id,
      v_action.title,
      'active',
      v_cadence,
      v_weekdays,
      v_action.estimated_minutes,
      case
        when v_action.scheduled_time is null then null
        else (v_action.scheduled_time at time zone v_timezone)::time
      end,
      'skip',
      'user_stated',
      v_action.local_date,
      v_action.details,
      case
        when v_action.due_local_date is null then null
        else (v_action.due_local_date - v_action.local_date)::smallint
      end,
      v_action.due_local_time,
      v_action.reminder_offsets_minutes,
      v_action.goal_id,
      v_action.project_id
    ) returning id into v_routine_id;
  else
    if v_routine.status = 'ended' then
      raise exception 'Repeating Action is no longer active';
    end if;

    update public.routines
    set cadence = v_cadence,
        weekdays = v_weekdays,
        start_on = v_action.local_date
    where id = v_routine_id
      and user_id = p_user_id
      and status = 'active';

    if not found then
      raise exception 'Repeating Action is no longer active';
    end if;
  end if;

  update public.daily_actions
  set source_routine_id = v_routine_id,
      recurrence_pattern = 'none',
      recurrence_days = '{}',
      relationship_source = coalesce(
        relationship_source,
        'user_stated'::public.life_model_provenance
      )
  where id = v_action.id
    and user_id = p_user_id;
end;
$$;

revoke all on function private.reconcile_action_recurrence_v1(
  uuid, uuid, text, smallint[]
) from public, anon, authenticated;

create or replace function public.change_action_recurrence_v1(
  p_daily_action_id uuid,
  p_recurrence_pattern text,
  p_recurrence_days smallint[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  perform private.reconcile_action_recurrence_v1(
    v_user_id,
    p_daily_action_id,
    p_recurrence_pattern,
    p_recurrence_days
  );

  update public.profiles
  set last_active_at = clock_timestamp()
  where id = v_user_id;
end;
$$;

revoke all on function public.change_action_recurrence_v1(
  uuid, text, smallint[]
) from public, anon, authenticated;
grant execute on function public.change_action_recurrence_v1(
  uuid, text, smallint[]
) to authenticated;

create or replace function public.update_action_occurrence_v1(
  p_daily_action_id uuid,
  p_title text,
  p_duration_minutes integer,
  p_when_time time without time zone default null,
  p_due_local_date date default null,
  p_due_local_time time without time zone default null,
  p_reminder_offsets_minutes integer[] default '{}',
  p_details text default null,
  p_recurrence_pattern text default 'none',
  p_recurrence_days smallint[] default '{}'
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
  v_title text := nullif(btrim(p_title), '');
  v_details text := nullif(btrim(p_details), '');
  v_reminders integer[];
  v_scheduled_time timestamptz;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;

  select action.* into v_action
  from public.daily_actions as action
  where action.id = p_daily_action_id and action.user_id = v_user_id
  for update;
  if v_action.id is null then raise exception 'Action not found'; end if;
  if v_action.completion_evidence_only then
    raise exception 'Use completed-evidence correction for this Action';
  end if;

  if v_action.daily_plan_id is not null then
    select plan.* into v_plan
    from public.daily_plans as plan
    where plan.id = v_action.daily_plan_id and plan.user_id = v_user_id
    for update;
  end if;
  if not (
    (v_action.daily_plan_id is null and v_action.status = 'proposed')
    or (v_plan.status = 'proposed' and v_action.status = 'proposed')
    or (v_plan.status = 'active' and v_action.status = 'active')
  ) then
    raise exception 'This Action cannot be edited in its current state';
  end if;

  select profile.timezone into v_timezone
  from public.profiles as profile where profile.id = v_user_id;
  if v_timezone is null then raise exception 'Profile timezone not found'; end if;
  if v_title is null or char_length(v_title) > 200 then
    raise exception 'Action title must be between 1 and 200 characters';
  end if;
  if p_duration_minutes not between 1 and 1440 then
    raise exception 'Action duration must be between 1 and 1440 minutes';
  end if;
  if v_details is not null and char_length(v_details) > 2000 then
    raise exception 'Details must be 2000 characters or fewer';
  end if;
  if p_due_local_time is not null and p_due_local_date is null then
    raise exception 'A due time requires a due date';
  end if;
  if p_due_local_date is not null and p_due_local_date < v_action.local_date then
    raise exception 'Due must be on or after the Action date';
  end if;
  if p_recurrence_pattern <> 'none'
    and p_due_local_date is not null
    and p_due_local_date - v_action.local_date > 365
  then
    raise exception 'A repeating Action Due must be within 365 days of its occurrence';
  end if;

  v_reminders := private.canonicalize_calendar_reminder_offsets(
    coalesce(p_reminder_offsets_minutes, '{}'::integer[])
  );
  if not private.calendar_reminder_offsets_are_valid(v_reminders, false) then
    raise exception 'Action reminder offsets are invalid';
  end if;
  if cardinality(v_reminders) > 0 and p_when_time is null and p_due_local_time is null then
    raise exception 'Action reminders require When or an exact Due time';
  end if;
  if p_when_time is not null then
    v_scheduled_time := (v_action.local_date + p_when_time) at time zone v_timezone;
    if v_scheduled_time <= clock_timestamp()
      and v_scheduled_time is distinct from v_action.scheduled_time
    then
      raise exception 'A new scheduled time must be in the future';
    end if;
  end if;

  update public.daily_actions
  set title = v_title,
      action_type = case when p_when_time is null then 'flexible' else 'fixed' end,
      estimated_minutes = p_duration_minutes,
      scheduled_time = v_scheduled_time,
      due_local_date = p_due_local_date,
      due_local_time = p_due_local_time,
      reminder_offsets_minutes = v_reminders,
      details = v_details,
      why_it_exists = case
        when v_details is not null then 'Context: ' || v_details
        when why_it_exists like 'Context: %' then 'Added by the user.'
        else why_it_exists
      end,
      original_input = coalesce(original_input, v_title)
  where id = v_action.id and user_id = v_user_id;

  perform private.reconcile_action_recurrence_v1(
    v_user_id,
    v_action.id,
    p_recurrence_pattern,
    p_recurrence_days
  );

  update public.profiles set last_active_at = clock_timestamp()
  where id = v_user_id;
end;
$$;

revoke all on function public.update_action_occurrence_v1(
  uuid, text, integer, time without time zone, date,
  time without time zone, integer[], text, text, smallint[]
) from public, anon, authenticated;
grant execute on function public.update_action_occurrence_v1(
  uuid, text, integer, time without time zone, date,
  time without time zone, integer[], text, text, smallint[]
) to authenticated;

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
  v_today date;
  v_now timestamptz := clock_timestamp();
  v_completed_at timestamptz;
  v_note text := nullif(btrim(p_outcome_note), '');
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;

  select commitment.* into v_commitment
  from public.calendar_commitments as commitment
  where commitment.id = p_calendar_commitment_id
    and commitment.user_id = v_user_id
  for update;

  if v_commitment.id is null or v_commitment.commitment_type <> 'event' then
    raise exception 'Calendar occurrence not found';
  end if;

  select profile.timezone into v_timezone
  from public.profiles as profile
  where profile.id = v_user_id;
  if v_timezone is null then raise exception 'Profile timezone not found'; end if;
  v_today := (v_now at time zone v_timezone)::date;

  if p_occurrence_date > v_today and (
    p_new_outcome is distinct from 'cancelled'::public.calendar_event_outcome
    or p_completed_time is not null
    or v_note is not null
  ) then
    raise exception 'A future Calendar occurrence can only be skipped';
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

  select occurrence.* into v_occurrence
  from public.calendar_commitment_occurrences as occurrence
  where occurrence.calendar_commitment_id = v_commitment.id
    and occurrence.user_id = v_user_id
    and occurrence.occurrence_date = p_occurrence_date
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
    case
      when p_occurrence_date > v_today then 'User skipped this future occurrence.'
      else 'User corrected this occurrence outcome.'
    end,
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
  set outcome = p_new_outcome,
      outcome_note = v_note,
      replacement_commitment_id = null,
      completed_at = v_completed_at,
      recorded_at = v_now
  where id = v_occurrence.id
    and user_id = v_user_id;

  update public.profiles set last_active_at = v_now
  where id = v_user_id;
  return v_occurrence.id;
end;
$$;

revoke all on function public.correct_calendar_event_occurrence_outcome(
  uuid, date, public.calendar_event_outcome, time without time zone, text
) from public, anon, authenticated;
grant execute on function public.correct_calendar_event_occurrence_outcome(
  uuid, date, public.calendar_event_outcome, time without time zone, text
) to authenticated;

notify pgrst, 'reload schema';
