-- Keep Action relationship provenance strongly typed. PostgreSQL resolves a
-- CASE containing only NULL and an uncast string literal as text, which cannot
-- be assigned to the life_model_provenance enum column.

create or replace function public.create_action_occurrence_v1(
  p_local_date date,
  p_title text,
  p_duration_minutes integer,
  p_daily_plan_id uuid default null,
  p_when_time time without time zone default null,
  p_due_local_date date default null,
  p_due_local_time time without time zone default null,
  p_recurrence_pattern text default 'none',
  p_recurrence_days smallint[] default '{}',
  p_reminder_offsets_minutes integer[] default '{}',
  p_details text default null,
  p_completed boolean default false,
  p_completion_evidence_only boolean default false,
  p_linked_context_label text default null,
  p_linked_context_kind text default null,
  p_ongoing_context_suggestion text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_timezone text;
  v_today date;
  v_plan public.daily_plans%rowtype;
  v_title text := nullif(btrim(p_title), '');
  v_details text := nullif(btrim(p_details), '');
  v_linked_context_label text := nullif(btrim(p_linked_context_label), '');
  v_ongoing_context_suggestion text := nullif(btrim(p_ongoing_context_suggestion), '');
  v_reminders integer[];
  v_scheduled_time timestamptz;
  v_completed_at timestamptz;
  v_routine_id uuid;
  v_routine_start date;
  v_cadence public.routine_cadence;
  v_routine_weekdays smallint[] := '{}';
  v_due_offset smallint;
  v_sort_order integer;
  v_action_id uuid := gen_random_uuid();
  v_relationship_source public.life_model_provenance;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select profile.timezone
  into v_timezone
  from public.profiles as profile
  where profile.id = v_user_id;
  if v_timezone is null then
    raise exception 'Profile timezone not found';
  end if;
  v_today := (clock_timestamp() at time zone v_timezone)::date;

  if p_local_date is null then
    raise exception 'Action date is required';
  end if;
  if v_title is null or char_length(v_title) > 200 then
    raise exception 'Action title must be between 1 and 200 characters';
  end if;
  if p_completed then
    if p_local_date > v_today then
      raise exception 'Completed activity cannot be recorded in the future';
    end if;
    if p_duration_minutes not between 0 and 1440 then
      raise exception 'Completed Action duration must be between 0 and 1440 minutes';
    end if;
  elsif p_local_date < v_today then
    raise exception 'A planned Action cannot be created in the past';
  elsif p_duration_minutes not between 1 and 1440 then
    raise exception 'Action duration must be between 1 and 1440 minutes';
  end if;
  if v_details is not null and char_length(v_details) > 2000 then
    raise exception 'Details must be 2000 characters or fewer';
  end if;
  if (v_linked_context_label is null) <> (p_linked_context_kind is null) then
    raise exception 'Linked context label and kind must be set together';
  end if;
  if p_linked_context_kind is not null and p_linked_context_kind not in ('project', 'area') then
    raise exception 'Unknown linked context kind';
  end if;
  if v_linked_context_label is not null and char_length(v_linked_context_label) > 100 then
    raise exception 'Linked context label is too long';
  end if;
  if v_ongoing_context_suggestion is not null and char_length(v_ongoing_context_suggestion) > 100 then
    raise exception 'Ongoing context suggestion is too long';
  end if;
  if p_due_local_time is not null and p_due_local_date is null then
    raise exception 'A due time requires a due date';
  end if;
  if p_due_local_date is not null
    and p_due_local_date < p_local_date
    and (not p_completed or p_recurrence_pattern <> 'none')
  then
    raise exception 'Due must be on or after the Action date';
  end if;
  if p_recurrence_pattern <> 'none'
    and p_due_local_date is not null
    and p_due_local_date - p_local_date > 365
  then
    raise exception 'A repeating Action Due must be within 365 days of its occurrence';
  end if;

  if p_recurrence_pattern not in ('none', 'daily', 'weekly', 'certain_days')
    or p_recurrence_days is null
    or not (p_recurrence_days <@ array[0,1,2,3,4,5,6]::smallint[])
    or cardinality(p_recurrence_days) > 7
    or (
      p_recurrence_pattern = 'certain_days'
      and cardinality(p_recurrence_days) = 0
    )
    or (
      p_recurrence_pattern <> 'certain_days'
      and cardinality(p_recurrence_days) > 0
    )
  then
    raise exception 'Action recurrence is invalid';
  end if;

  v_reminders := private.canonicalize_calendar_reminder_offsets(
    coalesce(p_reminder_offsets_minutes, '{}'::integer[])
  );
  if not private.calendar_reminder_offsets_are_valid(v_reminders, false) then
    raise exception 'Action reminder offsets are invalid';
  end if;
  if cardinality(v_reminders) > 0
    and p_when_time is null
    and p_due_local_time is null
  then
    raise exception 'Action reminders require When or an exact Due time';
  end if;

  if p_when_time is not null then
    if p_completed then
      v_completed_at := (p_local_date + p_when_time) at time zone v_timezone;
      if v_completed_at > clock_timestamp() then
        raise exception 'Completion time cannot be in the future';
      end if;
    else
      v_scheduled_time := (p_local_date + p_when_time) at time zone v_timezone;
      if v_scheduled_time <= clock_timestamp() then
        raise exception 'A new Action cannot be scheduled in the past';
      end if;
    end if;
  end if;

  if p_daily_plan_id is not null then
    select plan.* into v_plan
    from public.daily_plans as plan
    where plan.id = p_daily_plan_id
      and plan.user_id = v_user_id
    for update;
    if v_plan.id is null then raise exception 'Daily plan not found'; end if;
    if v_plan.local_date <> p_local_date
      or v_plan.status not in ('proposed', 'active')
    then
      raise exception 'Action date does not match an editable Daily Plan';
    end if;
  elsif not p_completed then
    select plan.* into v_plan
    from public.daily_plans as plan
    where plan.user_id = v_user_id
      and plan.local_date = p_local_date
      and plan.status in ('proposed', 'active')
    for update;
  end if;

  if p_recurrence_pattern <> 'none' then
    if p_completed and p_duration_minutes = 0 then
      raise exception 'Add Duration before making completed activity repeat';
    end if;
    if p_completed
      and cardinality(v_reminders) > 0
      and p_due_local_time is null
    then
      raise exception 'A repeating completed Action needs an exact Due time for reminders';
    end if;
    v_routine_start := case
      when p_completed and p_recurrence_pattern = 'weekly'
        then p_local_date + 7
      when p_completed then p_local_date + 1
      else p_local_date
    end;
    v_cadence := case p_recurrence_pattern
      when 'daily' then 'daily'::public.routine_cadence
      when 'weekly' then 'weekly'::public.routine_cadence
      else 'certain_days'::public.routine_cadence
    end;
    v_routine_weekdays := case
      when p_recurrence_pattern = 'certain_days' then p_recurrence_days
      else '{}'::smallint[]
    end;
    v_due_offset := case
      when p_due_local_date is null then null
      else (p_due_local_date - p_local_date)::smallint
    end;

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
      reminder_offsets_minutes
    ) values (
      v_user_id,
      null,
      v_title,
      'active',
      v_cadence,
      v_routine_weekdays,
      p_duration_minutes,
      case when p_completed then null else p_when_time end,
      'skip',
      'user_stated',
      v_routine_start,
      v_details,
      v_due_offset,
      p_due_local_time,
      v_reminders
    ) returning id into v_routine_id;
  end if;

  v_relationship_source := case
    when v_routine_id is null then null
    else 'user_stated'::public.life_model_provenance
  end;

  select coalesce(max(action.sort_order), -1) + 1
  into v_sort_order
  from public.daily_actions as action
  where action.user_id = v_user_id
    and action.local_date = p_local_date
    and action.daily_plan_id is not distinct from v_plan.id;

  insert into public.daily_actions (
    id, user_id, daily_plan_id, local_date, title, action_type, status,
    estimated_minutes, actual_minutes, scheduled_time, due_local_date,
    due_local_time, reminder_offsets_minutes, details, why_it_exists,
    definition_of_done, suggested_method, sort_order, completed_at,
    completion_recorded_at, completion_time_unknown,
    completion_evidence_only, approved_at, original_input,
    recurrence_pattern, recurrence_days, source_routine_id,
    relationship_source, linked_context_label, linked_context_kind,
    ongoing_context_suggestion
  ) values (
    v_action_id,
    v_user_id,
    v_plan.id,
    p_local_date,
    v_title,
    case when p_when_time is null or p_completed then 'flexible' else 'fixed' end,
    case
      when p_completed then 'completed'::public.daily_action_status
      when v_plan.status = 'active' then 'active'::public.daily_action_status
      else 'proposed'::public.daily_action_status
    end,
    case when p_completed and p_completion_evidence_only then 0 else greatest(p_duration_minutes, 1) end,
    case when p_completed then nullif(p_duration_minutes, 0) else null end,
    v_scheduled_time,
    p_due_local_date,
    p_due_local_time,
    case when p_completed then '{}'::integer[] else v_reminders end,
    v_details,
    coalesce('Context: ' || v_details, 'Added by the user.'),
    v_title,
    'Complete the action as planned.',
    v_sort_order,
    v_completed_at,
    case when p_completed then clock_timestamp() else null end,
    p_completed and v_completed_at is null,
    p_completed and p_completion_evidence_only,
    case when v_plan.status = 'active' then v_plan.approved_at else null end,
    v_title,
    'none',
    '{}'::smallint[],
    v_routine_id,
    v_relationship_source,
    v_linked_context_label,
    p_linked_context_kind,
    v_ongoing_context_suggestion
  );

  if p_completed then
    perform private.touch_profile_and_record_event(
      v_user_id,
      'action_completed',
      jsonb_build_object(
        'dailyPlanId', v_plan.id,
        'dailyActionId', v_action_id,
        'completedEvidenceOnly', p_completion_evidence_only
      )
    );
  else
    update public.profiles set last_active_at = clock_timestamp()
    where id = v_user_id;
  end if;
  return v_action_id;
end;
$$;

create or replace function public.update_completed_action_occurrence_v1(
  p_daily_action_id uuid,
  p_title text,
  p_completed_time time without time zone default null,
  p_actual_minutes integer default null,
  p_due_local_date date default null,
  p_due_local_time time without time zone default null,
  p_recurrence_pattern text default 'none',
  p_recurrence_days smallint[] default '{}',
  p_reminder_offsets_minutes integer[] default '{}',
  p_details text default null
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
  v_now timestamptz := clock_timestamp();
  v_title text := nullif(btrim(p_title), '');
  v_details text := nullif(btrim(p_details), '');
  v_completed_at timestamptz;
  v_reminders integer[];
  v_routine_id uuid;
  v_cadence public.routine_cadence;
  v_weekdays smallint[] := '{}';
  v_relationship_source public.life_model_provenance;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;

  select action.* into v_action
  from public.daily_actions as action
  where action.id = p_daily_action_id and action.user_id = v_user_id
  for update;
  if v_action.id is null then raise exception 'Completed item not found'; end if;

  select plan.* into v_plan
  from public.daily_plans as plan
  where plan.id = v_action.daily_plan_id and plan.user_id = v_user_id
  for update;
  if v_plan.id is null
    or v_plan.status <> 'proposed'
    or v_plan.approved_at is not null
    or v_action.status <> 'completed'
    or not v_action.completion_evidence_only
    or v_action.approved_at is not null
  then
    raise exception 'Only completed activity in the current proposal can be edited';
  end if;

  select profile.timezone into v_timezone
  from public.profiles as profile where profile.id = v_user_id;
  if v_timezone is null then raise exception 'Profile timezone not found'; end if;
  if v_plan.local_date <> (v_now at time zone v_timezone)::date then
    raise exception 'Today has changed. Return to Today before editing this item';
  end if;
  if v_title is null or char_length(v_title) > 200 then
    raise exception 'Describe what you completed';
  end if;
  if p_actual_minutes is not null and p_actual_minutes not between 1 and 1440 then
    raise exception 'Duration must be between 1 and 1440 minutes';
  end if;
  if v_details is not null and char_length(v_details) > 2000 then
    raise exception 'Details must be 2000 characters or fewer';
  end if;
  if p_due_local_time is not null and p_due_local_date is null then
    raise exception 'A due time requires a due date';
  end if;
  if p_recurrence_pattern not in ('none', 'daily', 'weekly', 'certain_days')
    or p_recurrence_days is null
    or not (p_recurrence_days <@ array[0,1,2,3,4,5,6]::smallint[])
    or cardinality(p_recurrence_days) > 7
    or (p_recurrence_pattern = 'certain_days' and cardinality(p_recurrence_days) = 0)
    or (p_recurrence_pattern <> 'certain_days' and cardinality(p_recurrence_days) > 0)
  then
    raise exception 'Action recurrence is invalid';
  end if;
  if p_recurrence_pattern <> 'none'
    and p_due_local_date is not null
    and p_due_local_date < v_action.local_date
  then
    raise exception 'A repeating Action Due must be on or after this occurrence';
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
  if cardinality(v_reminders) > 0
    and (p_recurrence_pattern = 'none' or p_due_local_time is null)
  then
    raise exception 'Completed activity reminders require a repeating Action with an exact Due time';
  end if;
  if p_recurrence_pattern <> 'none' and p_actual_minutes is null then
    raise exception 'Add Duration before making completed activity repeat';
  end if;

  if p_completed_time is not null then
    v_completed_at := (v_action.local_date + p_completed_time) at time zone v_timezone;
    if date_trunc('minute', v_completed_at) > date_trunc('minute', v_now) then
      raise exception 'Completion time cannot be in the future';
    end if;
  end if;

  v_routine_id := v_action.source_routine_id;
  if p_recurrence_pattern = 'none' and v_routine_id is not null then
    update public.routines set status = 'ended', ended_at = v_now
    where id = v_routine_id and user_id = v_user_id and status <> 'ended';
    delete from public.daily_actions
    where user_id = v_user_id
      and source_routine_id = v_routine_id
      and local_date > v_action.local_date
      and daily_plan_id is null
      and status = 'proposed';
    v_routine_id := null;
  elsif p_recurrence_pattern <> 'none' then
    v_cadence := case p_recurrence_pattern
      when 'daily' then 'daily'::public.routine_cadence
      when 'weekly' then 'weekly'::public.routine_cadence
      else 'certain_days'::public.routine_cadence
    end;
    v_weekdays := case when p_recurrence_pattern = 'certain_days'
      then p_recurrence_days else '{}'::smallint[] end;

    if v_routine_id is null then
      insert into public.routines (
        user_id, life_area_id, title, status, cadence, weekdays,
        estimated_minutes, preferred_time, skip_policy, created_via,
        start_on, details, due_offset_days, due_local_time,
        reminder_offsets_minutes
      ) values (
        v_user_id, null, v_title, 'active', v_cadence, v_weekdays,
        p_actual_minutes, null, 'skip', 'user_stated',
        case when p_recurrence_pattern = 'weekly'
          then v_action.local_date + 7
          else v_action.local_date + 1 end,
        v_details,
        case when p_due_local_date is null then null
          else (p_due_local_date - v_action.local_date)::smallint end,
        p_due_local_time, v_reminders
      ) returning id into v_routine_id;
    else
      update public.routines
      set title = v_title,
          start_on = case when p_recurrence_pattern = 'weekly'
            then v_action.local_date + 7
            else v_action.local_date + 1 end,
          cadence = v_cadence,
          weekdays = v_weekdays,
          estimated_minutes = p_actual_minutes,
          details = v_details,
          due_offset_days = case when p_due_local_date is null then null
            else (p_due_local_date - v_action.local_date)::smallint end,
          due_local_time = p_due_local_time,
          reminder_offsets_minutes = v_reminders
      where id = v_routine_id and user_id = v_user_id and status = 'active';
      if not found then raise exception 'Repeating Action is no longer active'; end if;
      delete from public.daily_actions
      where user_id = v_user_id
        and source_routine_id = v_routine_id
        and local_date > v_action.local_date
        and daily_plan_id is null
        and status = 'proposed';
    end if;
  end if;

  v_relationship_source := case
    when v_routine_id is null then null
    else 'user_stated'::public.life_model_provenance
  end;

  update public.daily_actions
  set title = v_title,
      definition_of_done = v_title,
      completed_at = v_completed_at,
      completion_recorded_at = v_now,
      completion_time_unknown = v_completed_at is null,
      actual_minutes = p_actual_minutes,
      due_local_date = p_due_local_date,
      due_local_time = p_due_local_time,
      reminder_offsets_minutes = '{}',
      details = v_details,
      source_routine_id = v_routine_id,
      relationship_source = v_relationship_source
  where id = v_action.id and user_id = v_user_id;

  update public.profiles set last_active_at = v_now where id = v_user_id;
end;
$$;

revoke all on function public.create_action_occurrence_v1(
  date, text, integer, uuid, time without time zone, date,
  time without time zone, text, smallint[], integer[], text, boolean, boolean,
  text, text, text
) from public, anon, authenticated;
grant execute on function public.create_action_occurrence_v1(
  date, text, integer, uuid, time without time zone, date,
  time without time zone, text, smallint[], integer[], text, boolean, boolean,
  text, text, text
) to authenticated;

revoke all on function public.update_completed_action_occurrence_v1(
  uuid, text, time without time zone, integer, date,
  time without time zone, text, smallint[], integer[], text
) from public, anon, authenticated;
grant execute on function public.update_completed_action_occurrence_v1(
  uuid, text, time without time zone, integer, date,
  time without time zone, text, smallint[], integer[], text
) to authenticated;

notify pgrst, 'reload schema';
