create function public.remove_action_from_today(
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

  if v_plan.status <> 'active'
    or v_action.status <> 'active'
  then
    raise exception 'Only an unfinished action in Active Today can be removed';
  end if;

  update public.daily_actions
  set
    status = 'dropped',
    completed_at = null,
    rescheduled_for = null,
    resolution_note = 'Removed from today'
  where id = v_action.id;

  perform private.touch_profile_and_record_event(
    v_user_id,
    'action_removed_from_today',
    jsonb_build_object(
      'dailyActionId', v_action.id,
      'dailyPlanId', v_action.daily_plan_id
    )
  );
end;
$$;

revoke all on function public.remove_action_from_today(uuid)
  from public, anon;

grant execute on function public.remove_action_from_today(uuid)
  to authenticated;

create function public.replace_active_action(
  p_daily_action_id uuid,
  p_title text,
  p_action_type text,
  p_estimated_minutes integer,
  p_scheduled_time timestamptz,
  p_why_it_exists text,
  p_definition_of_done text,
  p_suggested_method text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_action public.daily_actions%rowtype;
  v_plan public.daily_plans%rowtype;
  v_new_action_id uuid := gen_random_uuid();
  v_title text := nullif(btrim(p_title), '');
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

  if v_plan.status <> 'active'
    or v_action.status <> 'active'
  then
    raise exception 'Only an unfinished action in Active Today can be replaced';
  end if;

  if v_title is null or char_length(v_title) > 200 then
    raise exception 'Replacement title must be between 1 and 200 characters';
  end if;

  if p_action_type not in ('fixed', 'flexible')
    or p_estimated_minutes not between 1 and 1440
    or (p_action_type = 'fixed' and p_scheduled_time is null)
    or (p_action_type = 'flexible' and p_scheduled_time is not null)
  then
    raise exception 'Invalid replacement timing';
  end if;

  update public.daily_actions
  set
    status = 'removed',
    completed_at = null,
    rescheduled_for = null,
    resolution_note = 'Replaced by action ' || v_new_action_id::text
  where id = v_action.id;

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
    recurrence_days
  )
  values (
    v_new_action_id,
    v_user_id,
    v_action.daily_plan_id,
    v_title,
    p_action_type,
    'active',
    p_estimated_minutes,
    p_scheduled_time,
    btrim(p_why_it_exists),
    btrim(p_definition_of_done),
    btrim(p_suggested_method),
    v_action.sort_order,
    now(),
    v_title,
    'none',
    '{}'
  );

  perform private.touch_profile_and_record_event(
    v_user_id,
    'action_replaced',
    jsonb_build_object(
      'replacedActionId', v_action.id,
      'replacementActionId', v_new_action_id,
      'dailyPlanId', v_action.daily_plan_id
    )
  );

  return v_new_action_id;
end;
$$;

revoke all on function public.replace_active_action(
  uuid,
  text,
  text,
  integer,
  timestamptz,
  text,
  text,
  text
) from public, anon;

grant execute on function public.replace_active_action(
  uuid,
  text,
  text,
  integer,
  timestamptz,
  text,
  text,
  text
) to authenticated;
