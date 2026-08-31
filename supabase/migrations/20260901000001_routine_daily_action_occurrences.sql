create unique index daily_actions_plan_source_routine_key
  on public.daily_actions (daily_plan_id, source_routine_id)
  where source_routine_id is not null;

create or replace function public.save_context_only_proposed_plan(
  p_local_date date,
  p_context_for_today text,
  p_focus text,
  p_actions jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan_id uuid;
  v_plan public.daily_plans%rowtype;
  v_timezone text;
  v_placeholder_time timestamptz := clock_timestamp();
  v_next_sort_order integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select profile.timezone
  into v_timezone
  from public.profiles as profile
  where profile.id = v_user_id;

  if v_timezone is null then
    raise exception 'Profile timezone not found';
  end if;

  if p_local_date is distinct from (clock_timestamp() at time zone v_timezone)::date then
    raise exception 'Routine occurrences can only be materialized for the profile-local current date';
  end if;

  v_plan_id := public.save_proposed_plan(
    p_local_date,
    v_placeholder_time,
    v_placeholder_time,
    p_context_for_today,
    p_focus,
    p_actions
  );

  select plan.*
  into v_plan
  from public.daily_plans as plan
  where plan.id = v_plan_id
    and plan.user_id = v_user_id
  for update;

  if v_plan.id is null then
    raise exception 'Daily plan not found';
  end if;

  if v_plan.status <> 'proposed' or v_plan.local_date <> p_local_date then
    raise exception 'Routine occurrences require the current proposed daily plan';
  end if;

  perform 1
  from public.routines as routine
  where routine.user_id = v_user_id
    and routine.status = 'active'
    and routine.cadence in ('daily', 'certain_days')
  order by routine.id
  for update;

  select coalesce(max(action.sort_order), -1) + 1
  into v_next_sort_order
  from public.daily_actions as action
  where action.daily_plan_id = v_plan.id
    and action.user_id = v_user_id
    and action.status <> 'removed';

  insert into public.daily_actions (
    id,
    user_id,
    daily_plan_id,
    title,
    action_type,
    status,
    estimated_minutes,
    scheduled_time,
    why_it_exists,
    definition_of_done,
    suggested_method,
    sort_order,
    approved_at,
    original_input,
    recurrence_pattern,
    recurrence_days,
    life_area_id,
    goal_id,
    project_id,
    source_routine_id,
    relationship_source
  )
  select
    gen_random_uuid(),
    v_user_id,
    v_plan.id,
    routine.title,
    case when routine.preferred_time is null then 'flexible' else 'fixed' end,
    'proposed'::public.daily_action_status,
    routine.estimated_minutes,
    case
      when routine.preferred_time is null then null
      else (p_local_date + routine.preferred_time) at time zone v_timezone
    end,
    'This routine applies today.',
    routine.title || ' is complete.',
    'Complete the routine as planned.',
    v_next_sort_order
      + (row_number() over (order by routine.created_at, routine.id) - 1)::integer,
    null,
    routine.title,
    'none',
    '{}'::smallint[],
    routine.life_area_id,
    routine.goal_id,
    routine.project_id,
    routine.id,
    routine.created_via
  from public.routines as routine
  where routine.user_id = v_user_id
    and routine.status = 'active'
    and (
      routine.cadence = 'daily'
      or (
        routine.cadence = 'certain_days'
        and extract(dow from p_local_date)::smallint = any(routine.weekdays)
      )
    )
    and not exists (
      select 1
      from public.daily_actions as existing
      where existing.daily_plan_id = v_plan.id
        and existing.user_id = v_user_id
        and existing.source_routine_id = routine.id
    )
  order by routine.created_at, routine.id
  on conflict (daily_plan_id, source_routine_id)
    where source_routine_id is not null
    do nothing;

  update public.daily_plans
  set
    woke_at = null,
    aiming_to_sleep_at = null
  where id = v_plan_id
    and user_id = v_user_id;

  if not found then
    raise exception 'Daily plan not found';
  end if;

  return v_plan_id;
end;
$$;

revoke all on function public.save_context_only_proposed_plan(
  date,
  text,
  text,
  jsonb
) from public, anon, authenticated;

grant execute on function public.save_context_only_proposed_plan(
  date,
  text,
  text,
  jsonb
) to authenticated;

notify pgrst, 'reload schema';
