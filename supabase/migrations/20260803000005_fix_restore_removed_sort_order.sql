create or replace function public.restore_removed_proposed_actions(
  p_daily_plan_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan public.daily_plans%rowtype;
  v_restored_count integer;
  v_sort_offset integer;
  v_kept_count integer;
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
    raise exception 'Only removed actions from a proposed plan can be restored';
  end if;

  perform 1
  from public.daily_actions
  where daily_plan_id = v_plan.id
    and user_id = v_user_id
  for update;

  select count(*)
  into v_restored_count
  from public.daily_actions
  where daily_plan_id = v_plan.id
    and user_id = v_user_id
    and status = 'removed'
    and approved_at is null;

  if v_restored_count = 0 then
    return 0;
  end if;

  select
    coalesce(max(sort_order), -1) + count(*)::integer + 1
  into v_sort_offset
  from public.daily_actions
  where daily_plan_id = v_plan.id
    and user_id = v_user_id;

  update public.daily_actions
  set sort_order = sort_order + v_sort_offset
  where daily_plan_id = v_plan.id
    and user_id = v_user_id
    and status <> 'removed';

  with kept_order as (
    select
      id,
      (row_number() over (
        order by sort_order, created_at, id
      ))::integer - 1 as next_sort_order
    from public.daily_actions
    where daily_plan_id = v_plan.id
      and user_id = v_user_id
      and status <> 'removed'
  )
  update public.daily_actions as action
  set sort_order = kept_order.next_sort_order
  from kept_order
  where action.id = kept_order.id;

  select count(*)
  into v_kept_count
  from public.daily_actions
  where daily_plan_id = v_plan.id
    and user_id = v_user_id
    and status <> 'removed';

  with removed_order as (
    select
      id,
      v_kept_count + (row_number() over (
        order by sort_order, created_at, id
      ))::integer - 1 as next_sort_order
    from public.daily_actions
    where daily_plan_id = v_plan.id
      and user_id = v_user_id
      and status = 'removed'
      and approved_at is null
  )
  update public.daily_actions as action
  set sort_order = removed_order.next_sort_order
  from removed_order
  where action.id = removed_order.id;

  update public.daily_actions
  set status = 'proposed'
  where daily_plan_id = v_plan.id
    and user_id = v_user_id
    and status = 'removed'
    and approved_at is null;

  update public.profiles
  set last_active_at = now()
  where id = v_user_id;

  return v_restored_count;
end;
$$;

revoke all on function public.restore_removed_proposed_actions(uuid)
from public, anon, authenticated;

grant execute on function public.restore_removed_proposed_actions(uuid)
to authenticated;

notify pgrst, 'reload schema';
