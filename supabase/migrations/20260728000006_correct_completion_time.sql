create function public.correct_action_completion_time(
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
  v_daily_plan_id uuid;
  v_plan_status public.daily_plan_status;
  v_plan_local_date date;
  v_action_status public.daily_action_status;
  v_timezone text;
  v_recorded_at timestamptz := clock_timestamp();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select daily_plan_id
  into v_daily_plan_id
  from public.daily_actions
  where id = p_daily_action_id
    and user_id = v_user_id;

  if v_daily_plan_id is null then
    raise exception 'Daily action not found';
  end if;

  select daily_plan.status, daily_plan.local_date, profile.timezone
  into v_plan_status, v_plan_local_date, v_timezone
  from public.daily_plans as daily_plan
  inner join public.profiles as profile
    on profile.id = daily_plan.user_id
  where daily_plan.id = v_daily_plan_id
    and daily_plan.user_id = v_user_id
    and profile.id = v_user_id
  for update of daily_plan;

  if v_plan_status is null then
    raise exception 'Daily plan not found';
  end if;

  if v_plan_status <> 'active' then
    raise exception 'Completion time can only be corrected on an active plan';
  end if;

  if v_plan_local_date <> (v_recorded_at at time zone v_timezone)::date then
    raise exception 'Completion time can only be corrected for the current local day';
  end if;

  select status
  into v_action_status
  from public.daily_actions
  where id = p_daily_action_id
    and daily_plan_id = v_daily_plan_id
    and user_id = v_user_id
  for update;

  if v_action_status is null or v_action_status <> 'completed' then
    raise exception 'Only a completed action can have its completion time corrected';
  end if;

  if p_time_unknown then
    if p_completed_at is not null then
      raise exception 'An unknown completion time cannot include an exact time';
    end if;
  else
    if p_completed_at is null then
      raise exception 'Choose a completion time or mark it as not recorded';
    end if;

    if (p_completed_at at time zone v_timezone)::date <> v_plan_local_date then
      raise exception 'Completion time must belong to the plan local date';
    end if;

    if p_completed_at > v_recorded_at then
      raise exception 'Completion time cannot be in the future';
    end if;
  end if;

  update public.daily_actions
  set
    completed_at = case
      when p_time_unknown then null
      else p_completed_at
    end,
    completion_time_unknown = p_time_unknown,
    completion_recorded_at = v_recorded_at
  where id = p_daily_action_id
    and daily_plan_id = v_daily_plan_id
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
)
  from public, anon;

grant execute on function public.correct_action_completion_time(
  uuid,
  timestamptz,
  boolean
)
  to authenticated;
