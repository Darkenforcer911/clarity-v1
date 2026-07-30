create or replace function public.begin_day_closing(
  p_daily_plan_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan public.daily_plans%rowtype;
  v_pre_close_actions jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
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

  if v_plan.status <> 'active' then
    raise exception 'Only an active plan can begin Close Day';
  end if;

  perform 1
  from public.daily_actions
  where daily_plan_id = v_plan.id
    and user_id = v_user_id
  for update;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'status', status::text,
        'completedAt', completed_at,
        'completionRecordedAt', completion_recorded_at,
        'completionTimeUnknown', completion_time_unknown,
        'rescheduledFor', rescheduled_for,
        'resolutionNote', resolution_note,
        'rescheduleCount', reschedule_count
      )
      order by sort_order
    ),
    '[]'::jsonb
  )
  into v_pre_close_actions
  from public.daily_actions
  where daily_plan_id = v_plan.id
    and user_id = v_user_id
    and approved_at is not null
    and status in ('active', 'completed');

  insert into public.day_records (
    user_id,
    daily_plan_id,
    notes,
    progress_recorded
  )
  values (
    v_user_id,
    v_plan.id,
    null,
    jsonb_build_object(
      'version', 1,
      'dailyPlanId', v_plan.id,
      'localDate', v_plan.local_date,
      'recordType', 'closing_snapshot',
      'preCloseActions', v_pre_close_actions,
      'recordedAt', now()
    )
  );

  update public.daily_plans
  set status = 'closing'
  where id = v_plan.id;

  perform private.touch_profile_and_record_event(
    v_user_id,
    'day_closing_started',
    jsonb_build_object('dailyPlanId', v_plan.id)
  );
end;
$$;

create or replace function public.finish_day(
  p_daily_plan_id uuid,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan public.daily_plans%rowtype;
  v_day_record_id uuid;
  v_recorded_at timestamptz := now();
  v_pre_close_actions jsonb;
  v_completed_count integer;
  v_total_count integer;
  v_completed_actions jsonb;
  v_unfinished_actions jsonb;
  v_progress_recorded jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_notes is not null and char_length(p_notes) > 5000 then
    raise exception 'Close Day notes are too long';
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

  if v_plan.status <> 'closing' then
    raise exception 'Only a closing plan can be finished';
  end if;

  select id, progress_recorded -> 'preCloseActions'
  into v_day_record_id, v_pre_close_actions
  from public.day_records
  where daily_plan_id = v_plan.id
    and user_id = v_user_id
  for update;

  if v_day_record_id is null
    or jsonb_typeof(v_pre_close_actions) <> 'array'
  then
    raise exception 'Close Day snapshot not found';
  end if;

  perform 1
  from public.daily_actions
  where daily_plan_id = v_plan.id
    and user_id = v_user_id
  for update;

  if exists (
    select 1
    from public.daily_actions as action
    inner join jsonb_array_elements(v_pre_close_actions) as snapshot(value)
      on (snapshot.value ->> 'id')::uuid = action.id
    where action.daily_plan_id = v_plan.id
      and action.user_id = v_user_id
      and snapshot.value ->> 'status' = 'active'
      and action.status in ('active', 'proposed')
  ) then
    raise exception 'Every unfinished action must be explicitly resolved';
  end if;

  if exists (
    select 1
    from public.daily_actions as action
    inner join jsonb_array_elements(v_pre_close_actions) as snapshot(value)
      on (snapshot.value ->> 'id')::uuid = action.id
    where action.daily_plan_id = v_plan.id
      and action.user_id = v_user_id
      and snapshot.value ->> 'status' = 'active'
      and (
        (action.status = 'rescheduled' and action.rescheduled_for is null)
        or (action.status = 'dropped' and action.rescheduled_for is not null)
        or action.status not in ('rescheduled', 'dropped')
      )
  ) then
    raise exception 'One or more action resolutions are invalid';
  end if;

  select
    count(*) filter (where action.status = 'completed'),
    count(*) filter (
      where action.status in ('completed', 'rescheduled', 'dropped')
    )
  into
    v_completed_count,
    v_total_count
  from public.daily_actions as action
  inner join jsonb_array_elements(v_pre_close_actions) as snapshot(value)
    on (snapshot.value ->> 'id')::uuid = action.id
  where action.daily_plan_id = v_plan.id
    and action.user_id = v_user_id
    and snapshot.value ->> 'status' in ('active', 'completed');

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', action.id,
        'title', action.title,
        'completedAt', action.completed_at,
        'completionTimeUnknown', action.completion_time_unknown
      )
      order by action.completed_at asc nulls last, action.sort_order
    ),
    '[]'::jsonb
  )
  into v_completed_actions
  from public.daily_actions as action
  inner join jsonb_array_elements(v_pre_close_actions) as snapshot(value)
    on (snapshot.value ->> 'id')::uuid = action.id
  where action.daily_plan_id = v_plan.id
    and action.user_id = v_user_id
    and snapshot.value ->> 'status' in ('active', 'completed')
    and action.status = 'completed';

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', action.id,
        'title', action.title,
        'outcome', action.status::text,
        'rescheduledFor', action.rescheduled_for
      )
      order by action.sort_order
    ),
    '[]'::jsonb
  )
  into v_unfinished_actions
  from public.daily_actions as action
  inner join jsonb_array_elements(v_pre_close_actions) as snapshot(value)
    on (snapshot.value ->> 'id')::uuid = action.id
  where action.daily_plan_id = v_plan.id
    and action.user_id = v_user_id
    and snapshot.value ->> 'status' = 'active'
    and action.status in ('rescheduled', 'dropped');

  v_progress_recorded := jsonb_build_object(
    'version', 1,
    'dailyPlanId', v_plan.id,
    'localDate', v_plan.local_date,
    'recordType', 'planned',
    'focus', v_plan.focus,
    'completedCount', v_completed_count,
    'totalCount', v_total_count,
    'completedActions', v_completed_actions,
    'unfinishedActions', v_unfinished_actions,
    'preCloseActions', v_pre_close_actions,
    'recordedAt', v_recorded_at
  );

  update public.day_records
  set
    notes = nullif(btrim(p_notes), ''),
    progress_recorded = v_progress_recorded
  where id = v_day_record_id
    and user_id = v_user_id;

  update public.daily_plans
  set
    status = 'closed',
    closed_at = v_recorded_at
  where id = v_plan.id;

  perform private.touch_profile_and_record_event(
    v_user_id,
    'day_closed',
    jsonb_build_object(
      'dailyPlanId', v_plan.id,
      'completedCount', v_completed_count,
      'totalCount', v_total_count
    )
  );

  return v_day_record_id;
end;
$$;

create or replace function public.undo_day_close(
  p_daily_plan_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan public.daily_plans%rowtype;
  v_timezone text;
  v_day_record public.day_records%rowtype;
  v_pre_close_actions jsonb;
  v_legacy_unfinished_actions jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
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

  if v_plan.status <> 'closed' then
    raise exception 'Only a closed plan can be undone';
  end if;

  select timezone
  into v_timezone
  from public.profiles
  where id = v_user_id;

  if v_timezone is null then
    raise exception 'Profile not found';
  end if;

  if v_plan.local_date <> (now() at time zone v_timezone)::date then
    raise exception 'A day can only be undone on the same local date';
  end if;

  select *
  into v_day_record
  from public.day_records
  where daily_plan_id = v_plan.id
    and user_id = v_user_id
  for update;

  if v_day_record.id is null then
    raise exception 'Closed Day record not found';
  end if;

  perform 1
  from public.daily_actions
  where daily_plan_id = v_plan.id
    and user_id = v_user_id
  for update;

  v_pre_close_actions :=
    v_day_record.progress_recorded -> 'preCloseActions';

  if v_pre_close_actions is not null then
    if jsonb_typeof(v_pre_close_actions) <> 'array'
      or exists (
        select 1
        from jsonb_array_elements(v_pre_close_actions) as snapshot(value)
        where snapshot.value ->> 'status'
          not in ('active', 'completed')
          or nullif(snapshot.value ->> 'id', '') is null
      )
    then
      raise exception 'Closed Day restoration snapshot is invalid';
    end if;

    update public.daily_actions as action
    set
      status = (snapshot.value ->> 'status')::public.daily_action_status,
      completed_at =
        nullif(snapshot.value ->> 'completedAt', '')::timestamptz,
      completion_recorded_at =
        nullif(
          snapshot.value ->> 'completionRecordedAt',
          ''
        )::timestamptz,
      completion_time_unknown = coalesce(
        (snapshot.value ->> 'completionTimeUnknown')::boolean,
        false
      ),
      rescheduled_for =
        nullif(snapshot.value ->> 'rescheduledFor', '')::date,
      resolution_note = snapshot.value ->> 'resolutionNote',
      reschedule_count = coalesce(
        (snapshot.value ->> 'rescheduleCount')::integer,
        action.reschedule_count
      )
    from jsonb_array_elements(v_pre_close_actions) as snapshot(value)
    where action.id = (snapshot.value ->> 'id')::uuid
      and action.daily_plan_id = v_plan.id
      and action.user_id = v_user_id;
  else
    v_legacy_unfinished_actions :=
      v_day_record.progress_recorded -> 'unfinishedActions';

    if jsonb_typeof(v_legacy_unfinished_actions) <> 'array' then
      raise exception 'Closed Day restoration snapshot is unavailable';
    end if;

    update public.daily_actions as action
    set
      status = 'active',
      rescheduled_for = null,
      resolution_note = null
    from jsonb_array_elements(v_legacy_unfinished_actions) as snapshot(value)
    where action.id = (snapshot.value ->> 'id')::uuid
      and action.daily_plan_id = v_plan.id
      and action.user_id = v_user_id
      and action.status in ('rescheduled', 'dropped')
      and coalesce(action.resolution_note, '') not in (
        'Removed from today',
        'Moved before plan approval',
        'Moved while adapting action',
        'Dropped while adapting action'
      )
      and coalesce(action.resolution_note, '')
        not like 'Replaced by action %';
  end if;

  delete from public.day_records
  where id = v_day_record.id
    and user_id = v_user_id;

  update public.daily_plans
  set
    status = 'active',
    closed_at = null
  where id = v_plan.id;

  perform private.touch_profile_and_record_event(
    v_user_id,
    'day_close_undone',
    jsonb_build_object('dailyPlanId', v_plan.id)
  );
end;
$$;

revoke all on function public.begin_day_closing(uuid)
  from public, anon;
revoke all on function public.finish_day(uuid, text)
  from public, anon;
revoke all on function public.undo_day_close(uuid)
  from public, anon;

grant execute on function public.begin_day_closing(uuid)
  to authenticated;
grant execute on function public.finish_day(uuid, text)
  to authenticated;
grant execute on function public.undo_day_close(uuid)
  to authenticated;
