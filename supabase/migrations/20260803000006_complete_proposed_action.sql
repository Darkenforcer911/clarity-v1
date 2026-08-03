create function public.complete_proposed_action(
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
  v_timezone text;
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

  if v_plan.id is null then
    raise exception 'Daily plan not found';
  end if;

  if v_plan.status <> 'proposed'
    or v_action.status <> 'proposed'
    or v_action.approved_at is not null
  then
    raise exception 'Only an unfinished action in a proposed plan can be completed';
  end if;

  if v_action.action_type <> 'fixed'
    or v_action.scheduled_time is null
  then
    raise exception 'Only a specific-time action can use its scheduled completion time';
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

  if (v_action.scheduled_time at time zone v_timezone)::date
    <> v_plan.local_date
  then
    raise exception 'The scheduled time does not belong to this plan date';
  end if;

  if date_trunc('minute', v_action.scheduled_time)
    >= date_trunc('minute', v_recorded_at)
  then
    raise exception 'The scheduled time has not passed yet';
  end if;

  update public.daily_actions
  set
    status = 'completed',
    completed_at = v_action.scheduled_time,
    completion_recorded_at = v_recorded_at,
    completion_time_unknown = false,
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

revoke all on function public.complete_proposed_action(uuid)
from public, anon, authenticated;

grant execute on function public.complete_proposed_action(uuid)
to authenticated;

notify pgrst, 'reload schema';
