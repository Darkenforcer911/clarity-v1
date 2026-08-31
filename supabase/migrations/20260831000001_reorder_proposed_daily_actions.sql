create function public.reorder_proposed_daily_actions(
  p_daily_plan_id uuid,
  p_ordered_action_ids uuid[]
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
  v_input_count integer;
  v_distinct_count integer;
  v_proposed_count integer;
  v_matching_count integer;
  v_current_order uuid[];
  v_sort_slots integer[];
  v_sort_offset integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_ordered_action_ids is null then
    raise exception 'Proposed Action order is required';
  end if;

  if array_position(p_ordered_action_ids, null) is not null then
    raise exception 'Proposed Action order cannot contain null IDs';
  end if;

  v_input_count := cardinality(p_ordered_action_ids);

  select count(distinct action_id)
  into v_distinct_count
  from unnest(p_ordered_action_ids) as ordered(action_id);

  if v_distinct_count <> v_input_count then
    raise exception 'Proposed Action order cannot contain duplicate IDs';
  end if;

  select plan.*
  into v_plan
  from public.daily_plans as plan
  where plan.id = p_daily_plan_id
    and plan.user_id = v_user_id
  for update;

  if v_plan.id is null then
    raise exception 'Daily plan not found';
  end if;

  if v_plan.status <> 'proposed' then
    raise exception 'Only a proposed daily plan can be reordered';
  end if;

  select profile.timezone
  into v_timezone
  from public.profiles as profile
  where profile.id = v_user_id;

  if v_timezone is null then
    raise exception 'Profile timezone not found';
  end if;

  if v_plan.local_date <> (clock_timestamp() at time zone v_timezone)::date then
    raise exception 'Only the current local daily plan can be reordered';
  end if;

  perform 1
  from public.daily_actions as action
  where action.daily_plan_id = v_plan.id
    and action.user_id = v_user_id
  order by action.id
  for update;

  select
    count(*),
    coalesce(
      array_agg(action.id order by action.sort_order, action.id),
      '{}'::uuid[]
    ),
    coalesce(
      array_agg(action.sort_order order by action.sort_order, action.id),
      '{}'::integer[]
    )
  into v_proposed_count, v_current_order, v_sort_slots
  from public.daily_actions as action
  where action.daily_plan_id = v_plan.id
    and action.user_id = v_user_id
    and action.status = 'proposed'
    and action.approved_at is null;

  select count(*)
  into v_matching_count
  from public.daily_actions as action
  where action.daily_plan_id = v_plan.id
    and action.user_id = v_user_id
    and action.status = 'proposed'
    and action.approved_at is null
    and action.id = any(p_ordered_action_ids);

  if v_input_count <> v_proposed_count
    or v_matching_count <> v_proposed_count
  then
    raise exception 'Proposed Action order is stale or incomplete';
  end if;

  if v_current_order = p_ordered_action_ids then
    return;
  end if;

  -- Keep the existing unfinished-action slots so completed evidence and removed
  -- Actions retain their own historical ordering values.
  select coalesce(max(action.sort_order), -1) + v_proposed_count + 1
  into v_sort_offset
  from public.daily_actions as action
  where action.daily_plan_id = v_plan.id
    and action.user_id = v_user_id;

  -- Move the mutable rows above every existing slot before assigning their
  -- final order, avoiding immediate unique-index collisions during swaps.
  update public.daily_actions as action
  set sort_order = action.sort_order + v_sort_offset
  where action.daily_plan_id = v_plan.id
    and action.user_id = v_user_id
    and action.status = 'proposed'
    and action.approved_at is null;

  update public.daily_actions as action
  set sort_order = v_sort_slots[ordered.ordinality::integer]
  from unnest(p_ordered_action_ids) with ordinality as ordered(id, ordinality)
  where action.id = ordered.id
    and action.daily_plan_id = v_plan.id
    and action.user_id = v_user_id
    and action.status = 'proposed'
    and action.approved_at is null;

  update public.profiles
  set last_active_at = clock_timestamp()
  where id = v_user_id;
end;
$$;

revoke all on function public.reorder_proposed_daily_actions(uuid, uuid[])
from public, anon, authenticated;

grant execute on function public.reorder_proposed_daily_actions(uuid, uuid[])
to authenticated;

notify pgrst, 'reload schema';
