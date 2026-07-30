alter type public.daily_action_status add value if not exists 'missed';

create function public.reconcile_previous_day_direct(
  p_daily_plan_id uuid,
  p_resolutions jsonb,
  p_extra_context text default null,
  p_unplanned_progress jsonb default '[]'::jsonb,
  p_context_summary text default null,
  p_ongoing_context_candidate jsonb default null
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
  v_action public.daily_actions%rowtype;
  v_resolution jsonb;
  v_outcome text;
  v_progress_note text;
  v_not_done_note text;
  v_approximate_minutes integer;
  v_approximate_work_time text;
  v_remaining_work text;
  v_blocker_note text;
  v_resolved_elsewhere_note text;
  v_completed_at timestamptz;
  v_unplanned_item jsonb;
  v_unplanned_title text;
  v_unplanned_outcome text;
  v_unplanned_minutes integer;
  v_unplanned_time_unknown boolean;
  v_recorded_at timestamptz := clock_timestamp();
  v_extra_context text := nullif(btrim(p_extra_context), '');
  v_expected_count integer;
  v_resolution_count integer;
  v_distinct_resolution_count integer;
  v_completed_count integer;
  v_total_count integer;
  v_completed_actions jsonb;
  v_unfinished_actions jsonb;
  v_action_progress jsonb := '[]'::jsonb;
  v_unplanned_progress jsonb := '[]'::jsonb;
  v_progress jsonb;
  v_record_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if v_extra_context is not null
    and char_length(v_extra_context) > 5000
  then
    raise exception 'Catch-up context is too long';
  end if;

  if p_resolutions is null
    or jsonb_typeof(p_resolutions) <> 'array'
  then
    raise exception 'Previous-day resolutions must be an array';
  end if;

  if p_unplanned_progress is null
    or jsonb_typeof(p_unplanned_progress) <> 'array'
    or jsonb_array_length(p_unplanned_progress) > 20
  then
    raise exception 'Unplanned work must be a list of 20 items or fewer';
  end if;

  if p_context_summary is not null
    and char_length(btrim(p_context_summary)) > 1000
  then
    raise exception 'Catch-up context summary is too long';
  end if;

  if p_ongoing_context_candidate is not null
    and (
      jsonb_typeof(p_ongoing_context_candidate) <> 'object'
      or nullif(
        btrim(p_ongoing_context_candidate ->> 'label'),
        ''
      ) is null
      or char_length(
        p_ongoing_context_candidate ->> 'label'
      ) > 100
      or nullif(
        btrim(p_ongoing_context_candidate ->> 'sourceText'),
        ''
      ) is null
      or char_length(
        p_ongoing_context_candidate ->> 'sourceText'
      ) > 500
      or (
        p_ongoing_context_candidate ? 'decision'
        and p_ongoing_context_candidate -> 'decision' <> 'null'::jsonb
      )
    )
  then
    raise exception 'Ongoing context candidate is invalid';
  end if;

  select timezone
  into v_timezone
  from public.profiles
  where id = v_user_id;

  if v_timezone is null then
    raise exception 'Profile not found';
  end if;

  v_today := (v_recorded_at at time zone v_timezone)::date;

  select *
  into v_plan
  from public.daily_plans
  where id = p_daily_plan_id
    and user_id = v_user_id
  for update;

  if v_plan.id is null then
    raise exception 'Previous plan not found';
  end if;

  if v_plan.local_date >= v_today then
    raise exception 'Only an earlier calendar day can be reconciled';
  end if;

  if v_plan.status not in ('proposed', 'active', 'closing') then
    raise exception 'This previous plan no longer needs reconciliation';
  end if;

  if exists (
    select 1
    from public.daily_plans
    where user_id = v_user_id
      and local_date < v_today
      and local_date > v_plan.local_date
  ) then
    raise exception 'Only the immediately previous plan can be reconciled';
  end if;

  if exists (
    select 1
    from public.day_records
    where daily_plan_id = v_plan.id
      and user_id = v_user_id
  ) then
    raise exception 'This previous plan has already been recorded';
  end if;

  perform 1
  from public.daily_actions
  where daily_plan_id = v_plan.id
    and user_id = v_user_id
  for update;

  if exists (
    select 1
    from jsonb_array_elements(p_resolutions) as resolution(value)
    where jsonb_typeof(value) <> 'object'
      or nullif(value ->> 'actionId', '') is null
      or nullif(value ->> 'outcome', '') is null
      or value ->> 'outcome' not in (
        'finished',
        'made_progress',
        'not_done',
        'resolved_elsewhere'
      )
      or (
        value ? 'completionCorrected'
        and jsonb_typeof(value -> 'completionCorrected') <> 'boolean'
      )
      or (
        value ->> 'outcome' = 'made_progress'
        and nullif(btrim(value ->> 'progressNote'), '') is null
      )
      or (
        value ->> 'outcome' <> 'made_progress'
        and (
          nullif(value ->> 'progressNote', '') is not null
          or nullif(value ->> 'approximateWorkTime', '') is not null
          or nullif(value ->> 'remainingWork', '') is not null
          or nullif(value ->> 'blockerNote', '') is not null
        )
      )
      or (
        value ->> 'outcome' <> 'resolved_elsewhere'
        and nullif(value ->> 'resolvedElsewhereNote', '') is not null
      )
      or (
        value ->> 'outcome' <> 'not_done'
        and nullif(value ->> 'notDoneNote', '') is not null
      )
      or (
        jsonb_typeof(value) = 'object'
        and exists (
          select 1
          from jsonb_object_keys(value) as submitted_key(key)
          where submitted_key.key not in (
            'actionId',
            'outcome',
            'completedAt',
            'completionCorrected',
            'progressNote',
            'notDoneNote',
            'approximateMinutes',
            'approximateWorkTime',
            'remainingWork',
            'blockerNote',
            'resolvedElsewhereNote'
          )
        )
      )
      or char_length(coalesce(value ->> 'progressNote', '')) > 500
      or char_length(coalesce(value ->> 'notDoneNote', '')) > 500
      or char_length(coalesce(value ->> 'remainingWork', '')) > 500
      or char_length(coalesce(value ->> 'blockerNote', '')) > 500
      or char_length(
        coalesce(value ->> 'resolvedElsewhereNote', '')
      ) > 500
      or (
        value ? 'approximateMinutes'
        and value -> 'approximateMinutes' <> 'null'::jsonb
        and (
          jsonb_typeof(value -> 'approximateMinutes') <> 'number'
          or (value ->> 'approximateMinutes')::numeric
            <> trunc((value ->> 'approximateMinutes')::numeric)
          or (value ->> 'approximateMinutes')::numeric
            not between 1 and 1440
          or value ->> 'outcome' in (
            'not_done',
            'resolved_elsewhere'
          )
        )
      )
      or (
        nullif(value ->> 'approximateWorkTime', '') is not null
        and value ->> 'approximateWorkTime'
          !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      )
  ) then
    raise exception 'Every action resolution must be valid';
  end if;

  select count(*), count(distinct value ->> 'actionId')
  into v_resolution_count, v_distinct_resolution_count
  from jsonb_array_elements(p_resolutions) as resolution(value);

  if v_resolution_count <> v_distinct_resolution_count then
    raise exception 'An action cannot have more than one resolution';
  end if;

  select count(*)
  into v_expected_count
  from public.daily_actions
  where daily_plan_id = v_plan.id
    and user_id = v_user_id
    and approved_at is not null
    and status in ('active', 'completed');

  if v_resolution_count <> v_expected_count then
    raise exception 'Choose one outcome for every action in Catch Up';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_resolutions) as resolution(value)
    left join public.daily_actions as action
      on action.id::text = resolution.value ->> 'actionId'
      and action.daily_plan_id = v_plan.id
      and action.user_id = v_user_id
      and action.approved_at is not null
      and action.status in ('active', 'completed')
    where action.id is null
  ) then
    raise exception 'Every submitted action must belong to this plan';
  end if;

  for v_action in
    select *
    from public.daily_actions
    where daily_plan_id = v_plan.id
      and user_id = v_user_id
      and approved_at is not null
      and status in ('active', 'completed')
    order by sort_order
  loop
    select value
    into v_resolution
    from jsonb_array_elements(p_resolutions)
    where value ->> 'actionId' = v_action.id::text;

    if v_resolution is null then
      raise exception 'An action is missing its Catch Up outcome';
    end if;

    v_outcome := v_resolution ->> 'outcome';
    v_progress_note :=
      nullif(btrim(v_resolution ->> 'progressNote'), '');
    v_not_done_note :=
      nullif(btrim(v_resolution ->> 'notDoneNote'), '');
    v_remaining_work :=
      nullif(btrim(v_resolution ->> 'remainingWork'), '');
    v_blocker_note :=
      nullif(btrim(v_resolution ->> 'blockerNote'), '');
    v_resolved_elsewhere_note :=
      nullif(
        btrim(v_resolution ->> 'resolvedElsewhereNote'),
        ''
      );
    v_approximate_work_time :=
      nullif(v_resolution ->> 'approximateWorkTime', '');
    v_approximate_minutes := null;
    v_completed_at := null;

    if v_resolution ? 'approximateMinutes'
      and v_resolution -> 'approximateMinutes' <> 'null'::jsonb
    then
      v_approximate_minutes :=
        (v_resolution ->> 'approximateMinutes')::integer;
    end if;

    if v_outcome = 'finished' then
      if nullif(v_resolution ->> 'completedAt', '') is not null then
        v_completed_at :=
          (v_resolution ->> 'completedAt')::timestamptz;

        if (
          v_completed_at at time zone v_timezone
        )::date <> v_plan.local_date
        then
          raise exception 'Completion time must belong to the previous plan date';
        end if;

        if v_completed_at > v_recorded_at then
          raise exception 'Completion time cannot be in the future';
        end if;
      end if;

      if v_action.status <> 'completed'
        or coalesce(
          (v_resolution ->> 'completionCorrected')::boolean,
          false
        )
      then
        update public.daily_actions
        set
          status = 'completed',
          completed_at = v_completed_at,
          completion_recorded_at = v_recorded_at,
          completion_time_unknown = v_completed_at is null,
          rescheduled_for = null,
          resolution_note =
            'Recorded during catch-up on ' || v_today::text
        where id = v_action.id
          and daily_plan_id = v_plan.id
          and user_id = v_user_id;
      else
        update public.daily_actions
        set
          completion_recorded_at = v_recorded_at,
          resolution_note =
            'Confirmed during catch-up on ' || v_today::text
        where id = v_action.id
          and daily_plan_id = v_plan.id
          and user_id = v_user_id;
      end if;
    elsif v_outcome = 'made_progress' then
      if nullif(v_resolution ->> 'completedAt', '') is not null then
        raise exception 'A progress update cannot include a completion time';
      end if;

      if v_progress_note is null then
        raise exception 'Made progress requires a short description';
      end if;

      update public.daily_actions
      set
        status = 'missed',
        rescheduled_for = null,
        resolution_note =
          'Made progress during catch-up on ' || v_today::text
      where id = v_action.id
        and daily_plan_id = v_plan.id
        and user_id = v_user_id;

      v_action_progress := v_action_progress || jsonb_build_array(
        jsonb_build_object(
          'actionId', v_action.id,
          'title', v_action.title,
          'outcome', 'made_progress',
          'progressLevel', null,
          'note', v_progress_note,
          'progressDescription', v_progress_note,
          'remainingWork', v_remaining_work,
          'blockerNote', v_blocker_note,
          'approximateMinutes', v_approximate_minutes,
          'approximateWorkTime', v_approximate_work_time,
          'recordedAt', v_recorded_at
        )
      );
    elsif v_outcome = 'not_done' then
      if nullif(v_resolution ->> 'completedAt', '') is not null then
        raise exception 'Not done cannot include a completion time';
      end if;

      update public.daily_actions
      set
        status = 'missed',
        rescheduled_for = null,
        resolution_note =
          'Not done during catch-up on ' || v_today::text
      where id = v_action.id
        and daily_plan_id = v_plan.id
        and user_id = v_user_id;

      v_action_progress := v_action_progress || jsonb_build_array(
        jsonb_build_object(
          'actionId', v_action.id,
          'title', v_action.title,
          'outcome', 'not_done',
          'progressLevel', null,
          'note', v_not_done_note,
          'notDoneNote', v_not_done_note,
          'progressDescription', null,
          'remainingWork', null,
          'blockerNote', null,
          'approximateMinutes', null,
          'approximateWorkTime', null,
          'recordedAt', v_recorded_at
        )
      );
    elsif v_outcome = 'resolved_elsewhere' then
      if nullif(v_resolution ->> 'completedAt', '') is not null then
        raise exception 'No longer needed cannot include a completion time';
      end if;

      update public.daily_actions
      set
        status = 'missed',
        rescheduled_for = null,
        resolution_note =
          'No longer needed during recap on ' || v_today::text
      where id = v_action.id
        and daily_plan_id = v_plan.id
        and user_id = v_user_id;

      v_action_progress := v_action_progress || jsonb_build_array(
        jsonb_build_object(
          'actionId', v_action.id,
          'title', v_action.title,
          'outcome', 'resolved_elsewhere',
          'progressLevel', null,
          'note', v_resolved_elsewhere_note,
          'progressDescription', null,
          'resolvedElsewhereNote', v_resolved_elsewhere_note,
          'remainingWork', null,
          'blockerNote', null,
          'approximateMinutes', null,
          'approximateWorkTime', null,
          'recordedAt', v_recorded_at
        )
      );
    else
      raise exception 'Every action needs a confirmed outcome';
    end if;
  end loop;

  for v_unplanned_item in
    select value
    from jsonb_array_elements(p_unplanned_progress)
  loop
    if jsonb_typeof(v_unplanned_item) <> 'object' then
      raise exception 'Every unplanned work item must be valid';
    end if;

    v_unplanned_title :=
      nullif(btrim(v_unplanned_item ->> 'title'), '');
    v_unplanned_outcome := v_unplanned_item ->> 'outcome';
    v_progress_note :=
      nullif(btrim(v_unplanned_item ->> 'progressNote'), '');
    v_remaining_work :=
      nullif(btrim(v_unplanned_item ->> 'remainingWork'), '');
    v_blocker_note :=
      nullif(btrim(v_unplanned_item ->> 'blockerNote'), '');
    v_approximate_work_time :=
      nullif(v_unplanned_item ->> 'approximateWorkTime', '');
    v_completed_at := null;
    v_unplanned_minutes := null;

    if v_unplanned_title is null
      or char_length(v_unplanned_title) > 200
    then
      raise exception 'Unplanned work needs a clear title';
    end if;

    if v_unplanned_outcome is null
      or v_unplanned_outcome not in ('finished', 'made_progress')
    then
      raise exception 'Unplanned work must be Finished or Made progress';
    end if;

    if v_unplanned_item ? 'estimatedMinutes'
      and v_unplanned_item -> 'estimatedMinutes' <> 'null'::jsonb
    then
      if jsonb_typeof(
        v_unplanned_item -> 'estimatedMinutes'
      ) <> 'number'
        or (
          v_unplanned_item ->> 'estimatedMinutes'
        )::numeric <> trunc(
          (v_unplanned_item ->> 'estimatedMinutes')::numeric
        )
        or (
          v_unplanned_item ->> 'estimatedMinutes'
        )::numeric not between 1 and 1440
      then
        raise exception 'Unplanned duration must be whole minutes within one day';
      end if;

      v_unplanned_minutes :=
        (v_unplanned_item ->> 'estimatedMinutes')::integer;
    end if;

    if char_length(coalesce(v_progress_note, '')) > 500 then
      raise exception 'Unplanned progress detail is too long';
    end if;

    if char_length(coalesce(v_remaining_work, '')) > 500
      or char_length(coalesce(v_blocker_note, '')) > 500
    then
      raise exception 'Unplanned progress detail is too long';
    end if;

    if v_approximate_work_time is not null
      and v_approximate_work_time
        !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    then
      raise exception 'Unplanned work time must be a valid local time';
    end if;

    if v_unplanned_outcome = 'finished' then
      if not (v_unplanned_item ? 'completionTimeUnknown')
        or jsonb_typeof(
          v_unplanned_item -> 'completionTimeUnknown'
        ) <> 'boolean'
      then
        raise exception 'Finished unplanned work needs an honest time marker';
      end if;

      v_unplanned_time_unknown :=
        (v_unplanned_item ->> 'completionTimeUnknown')::boolean;

      if nullif(v_unplanned_item ->> 'completedAt', '') is not null then
        v_completed_at :=
          (v_unplanned_item ->> 'completedAt')::timestamptz;

        if (
          v_completed_at at time zone v_timezone
        )::date <> v_plan.local_date
        then
          raise exception 'Unplanned completion time must belong to the previous plan date';
        end if;

        if v_completed_at > v_recorded_at then
          raise exception 'Unplanned completion time cannot be in the future';
        end if;
      end if;

      if v_unplanned_time_unknown = (v_completed_at is not null) then
        raise exception 'Unplanned completion time and unknown marker disagree';
      end if;

      v_unplanned_progress := v_unplanned_progress || jsonb_build_array(
        jsonb_build_object(
          'title', v_unplanned_title,
          'outcome', 'finished',
          'completedAt', v_completed_at,
          'completionRecordedAt', v_recorded_at,
          'completionTimeUnknown', v_unplanned_time_unknown,
          'estimatedMinutes', v_unplanned_minutes,
          'progressLevel', null,
          'progressNote', null,
          'approximateWorkTime', null,
          'remainingWork', null,
          'blockerNote', null,
          'occurredOn', v_plan.local_date,
          'recordedAt', v_recorded_at,
          'carryoverCandidate', false
        )
      );
    else
      if nullif(v_unplanned_item ->> 'completedAt', '') is not null then
        raise exception 'Unplanned progress cannot include a completion time';
      end if;

      v_unplanned_progress := v_unplanned_progress || jsonb_build_array(
        jsonb_build_object(
          'title', v_unplanned_title,
          'outcome', 'made_progress',
          'completedAt', null,
          'completionRecordedAt', v_recorded_at,
          'completionTimeUnknown', false,
          'estimatedMinutes', v_unplanned_minutes,
          'progressLevel', null,
          'progressNote', v_progress_note,
          'approximateWorkTime', v_approximate_work_time,
          'remainingWork', v_remaining_work,
          'blockerNote', v_blocker_note,
          'occurredOn', v_plan.local_date,
          'recordedAt', v_recorded_at,
          'carryoverCandidate', false
        )
      );
    end if;
  end loop;

  update public.daily_actions
  set status = 'removed'
  where daily_plan_id = v_plan.id
    and user_id = v_user_id
    and status = 'proposed'
    and approved_at is null;

  if exists (
    select 1
    from public.daily_actions
    where daily_plan_id = v_plan.id
      and user_id = v_user_id
      and approved_at is not null
      and status in ('active', 'proposed')
  ) then
    raise exception 'Every unfinished action must be resolved';
  end if;

  select
    count(*) filter (where action.status = 'completed'),
    count(*) filter (
      where action.status in ('completed', 'missed')
    )
  into v_completed_count, v_total_count
  from public.daily_actions as action
  where action.daily_plan_id = v_plan.id
    and action.user_id = v_user_id
    and action.approved_at is not null
    and exists (
      select 1
      from jsonb_array_elements(p_resolutions) as resolution(value)
      where resolution.value ->> 'actionId' = action.id::text
    );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', action.id,
        'title', action.title,
        'completedAt', action.completed_at,
        'completionTimeUnknown', action.completion_time_unknown,
        'approximateMinutes', (
          select (resolution.value ->> 'approximateMinutes')::integer
          from jsonb_array_elements(p_resolutions) as resolution(value)
          where resolution.value ->> 'actionId' = action.id::text
            and resolution.value ? 'approximateMinutes'
            and resolution.value -> 'approximateMinutes' <> 'null'::jsonb
        )
      )
      order by
        action.completed_at asc nulls last,
        action.sort_order
    ),
    '[]'::jsonb
  )
  into v_completed_actions
  from public.daily_actions as action
  where action.daily_plan_id = v_plan.id
    and action.user_id = v_user_id
    and action.approved_at is not null
    and action.status = 'completed'
    and exists (
      select 1
      from jsonb_array_elements(p_resolutions) as resolution(value)
      where resolution.value ->> 'actionId' = action.id::text
    );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', action.id,
        'title', action.title,
        'outcome', (
          select progress.value ->> 'outcome'
          from jsonb_array_elements(v_action_progress) as progress(value)
          where progress.value ->> 'actionId' = action.id::text
        ),
        'rescheduledFor', null,
        'progressLevel', null,
        'progressNote', (
          select progress.value ->> 'progressDescription'
          from jsonb_array_elements(v_action_progress) as progress(value)
          where progress.value ->> 'actionId' = action.id::text
        ),
        'notDoneNote', (
          select progress.value ->> 'notDoneNote'
          from jsonb_array_elements(v_action_progress) as progress(value)
          where progress.value ->> 'actionId' = action.id::text
        ),
        'remainingWork', (
          select progress.value ->> 'remainingWork'
          from jsonb_array_elements(v_action_progress) as progress(value)
          where progress.value ->> 'actionId' = action.id::text
        ),
        'blockerNote', (
          select progress.value ->> 'blockerNote'
          from jsonb_array_elements(v_action_progress) as progress(value)
          where progress.value ->> 'actionId' = action.id::text
        ),
        'resolvedElsewhereNote', (
          select progress.value ->> 'resolvedElsewhereNote'
          from jsonb_array_elements(v_action_progress) as progress(value)
          where progress.value ->> 'actionId' = action.id::text
        ),
        'approximateMinutes', (
          select (progress.value ->> 'approximateMinutes')::integer
          from jsonb_array_elements(v_action_progress) as progress(value)
          where progress.value ->> 'actionId' = action.id::text
            and progress.value -> 'approximateMinutes' <> 'null'::jsonb
        ),
        'approximateWorkTime', (
          select progress.value ->> 'approximateWorkTime'
          from jsonb_array_elements(v_action_progress) as progress(value)
          where progress.value ->> 'actionId' = action.id::text
        ),
        'recordedAt', (
          select progress.value ->> 'recordedAt'
          from jsonb_array_elements(v_action_progress) as progress(value)
          where progress.value ->> 'actionId' = action.id::text
        ),
        'linkedContextLabel', action.linked_context_label,
        'linkedContextKind', action.linked_context_kind
      )
      order by action.sort_order
    ),
    '[]'::jsonb
  )
  into v_unfinished_actions
  from public.daily_actions as action
  where action.daily_plan_id = v_plan.id
    and action.user_id = v_user_id
    and action.approved_at is not null
    and action.status = 'missed'
    and exists (
      select 1
      from jsonb_array_elements(p_resolutions) as resolution(value)
      where resolution.value ->> 'actionId' = action.id::text
    );

  v_progress := jsonb_build_object(
    'version', 1,
    'dailyPlanId', v_plan.id,
    'localDate', v_plan.local_date,
    'recordType', 'reconciled',
    'focus', v_plan.focus,
    'completedCount', v_completed_count,
    'totalCount', v_total_count,
    'completedActions', v_completed_actions,
    'unfinishedActions', v_unfinished_actions,
    'actionProgress', v_action_progress,
    'unplannedProgress', v_unplanned_progress,
    'contextSummary', nullif(btrim(p_context_summary), ''),
    'ongoingContextCandidate', p_ongoing_context_candidate,
    'explanation', v_extra_context,
    'recordedAt', v_recorded_at
  );

  insert into public.day_records (
    user_id,
    daily_plan_id,
    notes,
    progress_recorded
  )
  values (
    v_user_id,
    v_plan.id,
    v_extra_context,
    v_progress
  )
  returning id into v_record_id;

  update public.daily_plans
  set
    status = 'closed',
    closed_at = v_recorded_at
  where id = v_plan.id
    and user_id = v_user_id;

  update public.profiles
  set last_active_at = v_recorded_at
  where id = v_user_id;

  return v_record_id;
end;
$$;

revoke all on function public.reconcile_previous_day_direct(
  uuid,
  jsonb,
  text,
  jsonb,
  text,
  jsonb
)
  from public, anon;

grant execute on function public.reconcile_previous_day_direct(
  uuid,
  jsonb,
  text,
  jsonb,
  text,
  jsonb
)
  to authenticated;

create table public.return_gap_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  gap_start_date date not null,
  gap_end_date date not null,
  context_summary text,
  nothing_important boolean not null default false,
  recorded_at timestamptz not null default now(),
  constraint return_gap_records_date_order
    check (gap_start_date <= gap_end_date),
  constraint return_gap_records_context_length
    check (
      context_summary is null
      or char_length(context_summary) <= 2000
    ),
  constraint return_gap_records_acknowledgement
    check (
      (
        nothing_important
        and context_summary is null
      )
      or (
        not nothing_important
        and nullif(btrim(context_summary), '') is not null
      )
    ),
  constraint return_gap_records_user_range_unique
    unique (user_id, gap_start_date, gap_end_date)
);

create index return_gap_records_user_end_idx
  on public.return_gap_records (user_id, gap_end_date desc);

alter table public.return_gap_records enable row level security;
alter table public.return_gap_records force row level security;

create policy "Users can read their own return gap records"
  on public.return_gap_records
  for select
  using ((select auth.uid()) = user_id);

revoke all on table public.return_gap_records from public, anon;
grant select on table public.return_gap_records to authenticated;

create function public.get_latest_return_gap_record()
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_user_id uuid := auth.uid();
  v_record jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select jsonb_build_object(
    'id', record.id,
    'gapStartDate', record.gap_start_date,
    'gapEndDate', record.gap_end_date,
    'contextSummary', record.context_summary,
    'nothingImportant', record.nothing_important,
    'recordedAt', record.recorded_at
  )
  into v_record
  from public.return_gap_records as record
  where record.user_id = v_user_id
  order by record.gap_end_date desc, record.recorded_at desc
  limit 1;

  return v_record;
end;
$$;

create function public.record_return_gap(
  p_gap_start_date date,
  p_gap_end_date date,
  p_context_summary text default null,
  p_nothing_important boolean default false
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
  v_latest_plan_date date;
  v_latest_plan_status text;
  v_latest_gap_end date;
  v_anchor_date date;
  v_expected_start date;
  v_expected_end date;
  v_context_summary text := nullif(btrim(p_context_summary), '');
  v_record_id uuid;
  v_recorded_at timestamptz := clock_timestamp();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select profile.timezone
  into v_timezone
  from public.profiles as profile
  where profile.id = v_user_id;

  if v_timezone is null then
    raise exception 'Profile not found';
  end if;

  v_today := (v_recorded_at at time zone v_timezone)::date;

  select plan.local_date, plan.status::text
  into v_latest_plan_date, v_latest_plan_status
  from public.daily_plans as plan
  where plan.user_id = v_user_id
    and plan.local_date < v_today
  order by plan.local_date desc
  limit 1;

  select max(record.gap_end_date)
  into v_latest_gap_end
  from public.return_gap_records as record
  where record.user_id = v_user_id
    and record.gap_end_date < v_today;

  v_anchor_date := greatest(v_latest_plan_date, v_latest_gap_end);
  v_expected_start := v_anchor_date + 1;
  v_expected_end := v_today - 1;

  if v_anchor_date is null
    or v_expected_start > v_expected_end
  then
    raise exception 'There are no missed dates to record';
  end if;

  if v_latest_plan_status <> 'closed' then
    raise exception 'The latest previous plan is not closed';
  end if;

  if p_gap_start_date <> v_expected_start
    or p_gap_end_date <> v_expected_end
  then
    raise exception 'The missed date range has changed';
  end if;

  if exists (
    select 1
    from public.daily_plans as plan
    where plan.user_id = v_user_id
      and plan.local_date between p_gap_start_date and p_gap_end_date
  ) then
    raise exception 'A daily plan exists inside this missed date range';
  end if;

  if exists (
    select 1
    from public.daily_plans as plan
    where plan.user_id = v_user_id
      and plan.local_date < v_today
      and plan.status in ('proposed', 'active', 'closing')
  ) then
    raise exception 'Resolve the previous approved plan first';
  end if;

  if char_length(coalesce(v_context_summary, '')) > 2000 then
    raise exception 'Keep this context under 2,000 characters';
  end if;

  if p_nothing_important and v_context_summary is not null then
    raise exception 'Nothing important cannot include context';
  end if;

  if not p_nothing_important and v_context_summary is null then
    raise exception 'Add context or choose Nothing important happened';
  end if;

  insert into public.return_gap_records (
    user_id,
    gap_start_date,
    gap_end_date,
    context_summary,
    nothing_important,
    recorded_at
  )
  values (
    v_user_id,
    p_gap_start_date,
    p_gap_end_date,
    case when p_nothing_important then null else v_context_summary end,
    p_nothing_important,
    v_recorded_at
  )
  returning id into v_record_id;

  update public.profiles
  set last_active_at = v_recorded_at
  where id = v_user_id;

  return v_record_id;
end;
$$;

revoke all on function public.get_latest_return_gap_record()
  from public, anon;
grant execute on function public.get_latest_return_gap_record()
  to authenticated;

revoke all on function public.record_return_gap(
  date,
  date,
  text,
  boolean
)
  from public, anon;
grant execute on function public.record_return_gap(
  date,
  date,
  text,
  boolean
)
  to authenticated;
