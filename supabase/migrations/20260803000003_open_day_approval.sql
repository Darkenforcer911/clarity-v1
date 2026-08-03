create function public.approve_daily_plan_v2(
  p_daily_plan_id uuid,
  p_allow_empty boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan public.daily_plans%rowtype;
  v_proposed_action_count integer;
  v_completed_action_count integer;
  v_approved_at timestamptz := now();
  v_open_day boolean;
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

  if v_plan.status <> 'proposed' then
    raise exception 'Only a proposed plan can be approved';
  end if;

  select
    count(*) filter (where status = 'proposed'),
    count(*) filter (where status = 'completed')
  into v_proposed_action_count, v_completed_action_count
  from public.daily_actions
  where daily_plan_id = v_plan.id
    and user_id = v_user_id;

  v_open_day := v_proposed_action_count = 0;

  if v_open_day and not coalesce(p_allow_empty, false) then
    raise exception 'Confirm that this day should remain open before approval';
  end if;

  update public.daily_actions
  set
    status = 'active',
    approved_at = v_approved_at
  where daily_plan_id = v_plan.id
    and user_id = v_user_id
    and status = 'proposed';

  update public.daily_actions
  set approved_at = v_approved_at
  where daily_plan_id = v_plan.id
    and user_id = v_user_id
    and status = 'completed'
    and approved_at is null;

  update public.daily_plans
  set
    status = 'active',
    approved_at = v_approved_at
  where id = v_plan.id;

  perform private.touch_profile_and_record_event(
    v_user_id,
    'plan_approved',
    jsonb_build_object(
      'dailyPlanId', v_plan.id,
      'actionCount', v_proposed_action_count + v_completed_action_count,
      'openDay', v_open_day
    )
  );
end;
$$;

revoke all on function public.approve_daily_plan_v2(uuid, boolean)
from public, anon;

grant execute on function public.approve_daily_plan_v2(uuid, boolean)
to authenticated;
