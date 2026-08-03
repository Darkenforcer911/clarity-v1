create function public.cancel_day_closing(
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
  v_day_record_id uuid;
  v_pre_close_actions jsonb;
  v_snapshot_action jsonb;
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

  if v_plan.status = 'active' then
    return;
  end if;

  if v_plan.status <> 'closing' then
    raise exception 'Only a closing plan can return to Active Today';
  end if;

  perform 1
  from public.daily_actions
  where daily_plan_id = v_plan.id
    and user_id = v_user_id
  for update;

  select
    id,
    progress_recorded -> 'preCloseActions'
  into
    v_day_record_id,
    v_pre_close_actions
  from public.day_records
  where daily_plan_id = v_plan.id
    and user_id = v_user_id
    and progress_recorded ->> 'recordType' = 'closing_snapshot'
  for update;

  if v_day_record_id is null then
    if exists (
      select 1
      from public.daily_actions
      where daily_plan_id = v_plan.id
        and user_id = v_user_id
        and approved_at is not null
        and status not in ('active', 'completed', 'removed')
    ) then
      raise exception 'Close Day snapshot not found';
    end if;
  else
    if jsonb_typeof(v_pre_close_actions) <> 'array' then
      raise exception 'Close Day snapshot is invalid';
    end if;

    for v_snapshot_action in
      select value
      from jsonb_array_elements(v_pre_close_actions)
    loop
      if v_snapshot_action ->> 'status' not in ('active', 'completed') then
        raise exception 'Close Day snapshot contains an invalid action status';
      end if;

      update public.daily_actions
      set
        status = (v_snapshot_action ->> 'status')::public.daily_action_status,
        completed_at = (v_snapshot_action ->> 'completedAt')::timestamptz,
        completion_recorded_at =
          (v_snapshot_action ->> 'completionRecordedAt')::timestamptz,
        completion_time_unknown = coalesce(
          (v_snapshot_action ->> 'completionTimeUnknown')::boolean,
          false
        ),
        rescheduled_for =
          (v_snapshot_action ->> 'rescheduledFor')::date,
        resolution_note = v_snapshot_action ->> 'resolutionNote',
        reschedule_count = coalesce(
          (v_snapshot_action ->> 'rescheduleCount')::integer,
          0
        )
      where id = (v_snapshot_action ->> 'id')::uuid
        and daily_plan_id = v_plan.id
        and user_id = v_user_id;

      if not found then
        raise exception 'Close Day snapshot action not found';
      end if;
    end loop;

    delete from public.day_records
    where id = v_day_record_id
      and user_id = v_user_id;
  end if;

  update public.daily_plans
  set status = 'active'
  where id = v_plan.id
    and user_id = v_user_id;

  update public.profiles
  set last_active_at = now()
  where id = v_user_id;
end;
$$;

revoke all on function public.cancel_day_closing(uuid)
  from public, anon;

grant execute on function public.cancel_day_closing(uuid)
  to authenticated;
