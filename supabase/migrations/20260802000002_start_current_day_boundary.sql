create function public.start_current_day_v2()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_timezone text;
  v_today date;
  v_now timestamptz := clock_timestamp();
  v_latest_plan_date date;
  v_latest_plan_status text;
  v_latest_plan_approved_at timestamptz;
  v_latest_closed_plan_date date;
  v_latest_gap_end_date date;
  v_resolved_anchor date;
  v_gap_start_date date;
  v_gap_end_date date;
  v_state public.overnight_day_states%rowtype;
  v_plan public.daily_plans%rowtype;
  v_started_now boolean := false;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select profile.timezone
  into v_timezone
  from public.profiles as profile
  where profile.id = v_user_id
  for update;

  if v_timezone is null then
    raise exception 'Profile not found';
  end if;

  v_today := (v_now at time zone v_timezone)::date;

  select plan.local_date, plan.status::text, plan.approved_at
  into
    v_latest_plan_date,
    v_latest_plan_status,
    v_latest_plan_approved_at
  from public.daily_plans as plan
  where plan.user_id = v_user_id
    and plan.local_date < v_today
  order by plan.local_date desc, plan.created_at desc
  limit 1
  for update;

  if v_latest_plan_approved_at is not null
    and v_latest_plan_status in ('proposed', 'active', 'closing')
  then
    return jsonb_build_object(
      'outcome', 'previous_plan_unresolved',
      'previousLocalDate', v_latest_plan_date,
      'previousPlanStatus', v_latest_plan_status
    );
  end if;

  if v_latest_plan_approved_at is null
    and v_latest_plan_status in ('active', 'closing')
  then
    raise exception 'Previous daily plan has an invalid approval state';
  end if;

  if v_latest_plan_approved_at is null
    and exists (
      select 1
      from public.daily_actions as action
      join public.daily_plans as plan
        on plan.id = action.daily_plan_id
        and plan.user_id = action.user_id
      where plan.user_id = v_user_id
        and plan.local_date = v_latest_plan_date
        and action.approved_at is not null
    )
  then
    raise exception 'Previous daily plan has approved actions without approval';
  end if;

  select max(plan.local_date)
  into v_latest_closed_plan_date
  from public.daily_plans as plan
  where plan.user_id = v_user_id
    and plan.local_date < v_today
    and plan.status = 'closed';

  select max(record.gap_end_date)
  into v_latest_gap_end_date
  from public.return_gap_records as record
  where record.user_id = v_user_id
    and record.gap_end_date < v_today;

  v_resolved_anchor := greatest(
    v_latest_closed_plan_date,
    v_latest_gap_end_date
  );
  v_gap_end_date := v_today - 1;

  if v_resolved_anchor is not null then
    v_gap_start_date := v_resolved_anchor + 1;
  elsif v_latest_plan_status in ('unshaped', 'proposed') then
    v_gap_start_date := v_latest_plan_date;
  else
    v_gap_start_date := v_gap_end_date;
  end if;

  if v_gap_start_date <= v_gap_end_date then
    return jsonb_build_object(
      'outcome', 'return_gap_required',
      'gapStartDate', v_gap_start_date,
      'gapEndDate', v_gap_end_date
    );
  end if;

  select *
  into v_state
  from public.overnight_day_states
  where user_id = v_user_id
    and local_date = v_today
  for update;

  if v_state.id is null then
    insert into public.overnight_day_states (
      user_id,
      local_date,
      day_started_at,
      sleep_outcome,
      outcome_reported_at
    )
    values (
      v_user_id,
      v_today,
      v_now,
      'started_without_sleep',
      v_now
    )
    returning * into v_state;

    v_started_now := true;
  elsif v_state.day_started_at is null then
    update public.overnight_day_states
    set
      day_started_at = v_now,
      sleep_outcome = coalesce(
        sleep_outcome,
        'started_without_sleep'
      ),
      outcome_reported_at = coalesce(outcome_reported_at, v_now)
    where id = v_state.id
      and user_id = v_user_id
    returning * into v_state;

    v_started_now := true;
  end if;

  insert into public.daily_plans (user_id, local_date)
  values (v_user_id, v_today)
  on conflict (user_id, local_date) do nothing;

  select *
  into v_plan
  from public.daily_plans
  where user_id = v_user_id
    and local_date = v_today
  for update;

  if v_plan.id is null then
    raise exception 'Daily plan not found';
  end if;

  if v_plan.status <> 'unshaped' then
    return jsonb_build_object(
      'outcome', 'current_day_already_started',
      'planId', v_plan.id,
      'localDate', v_plan.local_date,
      'planStatus', v_plan.status
    );
  end if;

  if v_started_now then
    perform private.touch_profile_and_record_event(
      v_user_id,
      'day_shaping_started',
      jsonb_build_object(
        'dailyPlanId', v_plan.id,
        'localDate', v_plan.local_date
      )
    );
  else
    update public.profiles
    set last_active_at = v_now
    where id = v_user_id;
  end if;

  return jsonb_build_object(
    'outcome', 'started',
    'planId', v_plan.id,
    'localDate', v_plan.local_date
  );
end;
$$;

revoke all on function public.start_current_day_v2()
  from public, anon, authenticated;

grant execute on function public.start_current_day_v2()
  to authenticated;

create or replace function public.start_current_day()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  v_result := public.start_current_day_v2();

  if v_result ->> 'outcome' = 'previous_plan_unresolved' then
    raise exception 'Resolve the previous approved plan first';
  end if;

  if v_result ->> 'outcome' = 'return_gap_required' then
    raise exception 'Acknowledge the previous day first';
  end if;

  if v_result ->> 'outcome' in (
    'started',
    'current_day_already_started'
  ) then
    return (v_result ->> 'planId')::uuid;
  end if;

  raise exception 'Unknown day-start result';
end;
$$;

revoke all on function public.start_current_day()
  from public, anon;

grant execute on function public.start_current_day()
  to authenticated;
