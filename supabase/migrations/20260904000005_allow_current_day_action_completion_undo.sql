-- A current-day Action can be completed before its proposed Daily Plan is
-- accepted. Allow that one dated occurrence to be returned to its truthful
-- unfinished state without changing its Routine definition or future rows.
create or replace function public.set_action_completion(
  p_daily_action_id uuid,
  p_completed boolean
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
  v_today date;
  v_completed_at timestamptz := clock_timestamp();
  v_unfinished_status public.daily_action_status;
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

  if v_action.id is null then
    raise exception 'Daily action not found';
  end if;

  if v_action.daily_plan_id is null then
    raise exception 'The Action is not part of Today';
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

  select profile.timezone
  into v_timezone
  from public.profiles as profile
  where profile.id = v_user_id;

  if v_timezone is null then
    raise exception 'Profile timezone not found';
  end if;

  v_today := (v_completed_at at time zone v_timezone)::date;
  if v_plan.local_date <> v_today or v_action.local_date <> v_today then
    raise exception 'Only a current-day Action can be changed here';
  end if;

  if p_completed then
    if v_plan.status <> 'active' or v_action.status <> 'active' then
      raise exception 'Only an active action can be completed';
    end if;

    update public.daily_actions
    set
      status = 'completed',
      completed_at = v_completed_at,
      completion_recorded_at = v_completed_at,
      completion_time_unknown = false,
      rescheduled_for = null,
      resolution_note = null
    where id = v_action.id
      and user_id = v_user_id;

    perform private.touch_profile_and_record_event(
      v_user_id,
      'action_completed',
      jsonb_build_object(
        'dailyPlanId', v_plan.id,
        'dailyActionId', v_action.id
      )
    );
    return;
  end if;

  if v_action.status <> 'completed' then
    raise exception 'Only a completed action can be returned to unfinished';
  end if;

  v_unfinished_status := case
    when v_plan.status = 'active' then 'active'::public.daily_action_status
    when v_plan.status = 'proposed'
      and v_plan.approved_at is null
      and v_action.approved_at is null
      and not v_action.completion_evidence_only
      then 'proposed'::public.daily_action_status
    else null
  end;

  if v_unfinished_status is null then
    raise exception 'This completed Action cannot be undone here';
  end if;

  update public.daily_actions
  set
    status = v_unfinished_status,
    completed_at = null,
    completion_recorded_at = null,
    completion_time_unknown = false,
    rescheduled_for = null,
    resolution_note = null
  where id = v_action.id
    and user_id = v_user_id;

  -- Updating only this row deliberately preserves source_routine_id and the
  -- Routine definition, so another date's occurrence remains independent.
  update public.profiles
  set last_active_at = clock_timestamp()
  where id = v_user_id;
end;
$$;

revoke all on function public.set_action_completion(uuid, boolean)
from public, anon, authenticated;

grant execute on function public.set_action_completion(uuid, boolean)
to authenticated;

notify pgrst, 'reload schema';
