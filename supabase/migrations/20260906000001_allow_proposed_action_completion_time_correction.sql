-- Shape Today can contain truthful completion evidence before the proposed
-- plan is accepted. Permit correction of that one occurrence's actual time
-- while keeping its planned When and any Routine definition unchanged.
create or replace function public.correct_action_completion_time(
  p_daily_action_id uuid,
  p_completed_at timestamptz default null,
  p_time_unknown boolean default false
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

  select action.*
  into v_action
  from public.daily_actions as action
  where action.id = p_daily_action_id
    and action.user_id = v_user_id
  for update;

  if v_action.id is null or v_action.daily_plan_id is null then
    raise exception 'Daily action not found';
  end if;

  select plan.*
  into v_plan
  from public.daily_plans as plan
  where plan.id = v_action.daily_plan_id
    and plan.user_id = v_user_id
  for update;

  if v_plan.id is null then
    raise exception 'Daily plan not found';
  end if;

  if v_action.status <> 'completed'
    or v_action.completion_evidence_only
    or not (
      v_plan.status = 'active'
      or (
        v_plan.status = 'proposed'
        and v_plan.approved_at is null
        and v_action.approved_at is null
      )
    )
  then
    raise exception 'This Action completion time cannot be corrected here';
  end if;

  select profile.timezone
  into v_timezone
  from public.profiles as profile
  where profile.id = v_user_id;

  if v_timezone is null then
    raise exception 'Profile timezone not found';
  end if;

  if v_plan.local_date <> (v_recorded_at at time zone v_timezone)::date
    or v_action.local_date <> v_plan.local_date
  then
    raise exception 'Completion time can only be corrected for the current local day';
  end if;

  if p_time_unknown then
    if p_completed_at is not null then
      raise exception 'An unknown completion time cannot include an exact time';
    end if;
  else
    if p_completed_at is null then
      raise exception 'Choose a completion time or mark it as not recorded';
    end if;

    if (p_completed_at at time zone v_timezone)::date <> v_plan.local_date then
      raise exception 'Completion time must belong to the plan local date';
    end if;

    if p_completed_at > v_recorded_at then
      raise exception 'Completion time cannot be in the future';
    end if;
  end if;

  update public.daily_actions
  set
    completed_at = case when p_time_unknown then null else p_completed_at end,
    completion_time_unknown = p_time_unknown,
    completion_recorded_at = v_recorded_at
  where id = v_action.id
    and user_id = v_user_id;

  update public.profiles
  set last_active_at = v_recorded_at
  where id = v_user_id;
end;
$$;

revoke all on function public.correct_action_completion_time(
  uuid,
  timestamptz,
  boolean
) from public, anon, authenticated;

grant execute on function public.correct_action_completion_time(
  uuid,
  timestamptz,
  boolean
) to authenticated;

notify pgrst, 'reload schema';
