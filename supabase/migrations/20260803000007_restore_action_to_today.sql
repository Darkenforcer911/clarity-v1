alter table public.product_events
drop constraint product_events_known_name;

alter table public.product_events
add constraint product_events_known_name check (
  event_name in (
    'app_opened',
    'day_shaping_started',
    'plan_generated',
    'plan_approved',
    'action_completed',
    'day_closing_started',
    'day_closed',
    'day_close_undone',
    'action_removed_from_today',
    'action_replaced',
    'action_restored_to_today'
  )
);

create function public.restore_action_to_today(
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
    raise exception 'Action not found';
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

  select timezone
  into v_timezone
  from public.profiles
  where id = v_user_id;

  if v_timezone is null then
    raise exception 'Profile timezone not found';
  end if;

  if v_plan.status = 'active'
    and v_plan.local_date = (
      clock_timestamp() at time zone v_timezone
    )::date
    and v_action.status = 'active'
    and v_action.approved_at is not null
    and v_action.resolution_note is null
    and v_action.rescheduled_for is null
  then
    return;
  end if;

  if v_plan.status <> 'active'
    or v_plan.local_date <> (clock_timestamp() at time zone v_timezone)::date
    or v_action.status <> 'dropped'
    or v_action.approved_at is null
    or v_action.resolution_note is distinct from 'Removed from today'
    or v_action.rescheduled_for is not null
  then
    raise exception 'Only an action removed from Active Today can be restored';
  end if;

  update public.daily_actions
  set
    status = 'active',
    rescheduled_for = null,
    resolution_note = null
  where id = v_action.id;

  perform private.touch_profile_and_record_event(
    v_user_id,
    'action_restored_to_today',
    jsonb_build_object(
      'dailyActionId', v_action.id,
      'dailyPlanId', v_action.daily_plan_id
    )
  );
end;
$$;

revoke all on function public.restore_action_to_today(uuid)
from public, anon, authenticated;

grant execute on function public.restore_action_to_today(uuid)
to authenticated;

notify pgrst, 'reload schema';
