create function public.restore_removed_proposed_actions(
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

  update public.daily_actions
  set status = 'proposed'
  where daily_plan_id = v_plan.id
    and user_id = v_user_id
    and status = 'removed'
    and approved_at is null;

  get diagnostics v_restored_count = row_count;

  if v_restored_count > 0 then
    update public.profiles
    set last_active_at = now()
    where id = v_user_id;
  end if;

  return v_restored_count;
end;
$$;

revoke all on function public.restore_removed_proposed_actions(uuid)
from public, anon, authenticated;

grant execute on function public.restore_removed_proposed_actions(uuid)
to authenticated;

notify pgrst, 'reload schema';
