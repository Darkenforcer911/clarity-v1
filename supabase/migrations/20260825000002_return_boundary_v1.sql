alter table public.return_gap_records
  add column boundary_kind text not null default 'gap';

alter table public.return_gap_records
  add constraint return_gap_records_boundary_kind
  check (boundary_kind in ('gap', 'catch_up', 'get_current'));

alter table public.return_gap_records
  drop constraint return_gap_records_acknowledgement;

alter table public.return_gap_records
  add constraint return_gap_records_acknowledgement
  check (
    (
      boundary_kind = 'gap'
      and (
        (nothing_important and context_summary is null)
        or (
          not nothing_important
          and nullif(btrim(context_summary), '') is not null
        )
      )
    )
    or (
      boundary_kind in ('catch_up', 'get_current')
      and not nothing_important
      and (
        context_summary is null
        or nullif(btrim(context_summary), '') is not null
      )
    )
  );

create or replace function private.resolve_return_backlog(
  p_user_id uuid,
  p_today date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_yesterday date := p_today - 1;
  v_latest_boundary_end date;
  v_latest_closed_date date;
  v_resolved_anchor date;
  v_first_unresolved_date date;
  v_range_start date;
  v_day_count integer;
  v_unresolved_plan_date date;
  v_unresolved_plan_status text;
begin
  if p_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_today is null then
    raise exception 'Current local date is required';
  end if;

  select max(record.gap_end_date)
  into v_latest_boundary_end
  from public.return_gap_records as record
  where record.user_id = p_user_id
    and record.gap_end_date < p_today;

  if v_latest_boundary_end >= v_yesterday then
    return jsonb_build_object(
      'state', 'ready_for_today',
      'throughDate', v_latest_boundary_end
    );
  end if;

  select max(plan.local_date)
  into v_latest_closed_date
  from public.daily_plans as plan
  where plan.user_id = p_user_id
    and plan.local_date < p_today
    and plan.status = 'closed';

  v_resolved_anchor := greatest(
    v_latest_boundary_end,
    v_latest_closed_date
  );

  select min(plan.local_date)
  into v_first_unresolved_date
  from public.daily_plans as plan
  where plan.user_id = p_user_id
    and plan.local_date < p_today
    and (
      v_resolved_anchor is null
      or plan.local_date > v_resolved_anchor
    );

  if v_resolved_anchor is not null then
    v_range_start := v_resolved_anchor + 1;
  elsif v_first_unresolved_date is not null then
    v_range_start := v_first_unresolved_date;
  else
    v_range_start := v_yesterday;
  end if;

  if v_range_start > v_yesterday then
    return jsonb_build_object(
      'state', 'ready_for_today',
      'throughDate', coalesce(v_resolved_anchor, v_yesterday)
    );
  end if;

  if exists (
    select 1
    from public.daily_plans as plan
    where plan.user_id = p_user_id
      and plan.local_date between v_range_start and v_yesterday
      and plan.approved_at is null
      and plan.status in ('active', 'closing')
  ) then
    raise exception 'Previous daily plan has an invalid approval state';
  end if;

  if exists (
    select 1
    from public.daily_actions as action
    join public.daily_plans as plan
      on plan.id = action.daily_plan_id
      and plan.user_id = action.user_id
    where plan.user_id = p_user_id
      and plan.local_date between v_range_start and v_yesterday
      and plan.approved_at is null
      and action.approved_at is not null
  ) then
    raise exception 'Previous daily plan has approved actions without approval';
  end if;

  select plan.local_date, plan.status::text
  into v_unresolved_plan_date, v_unresolved_plan_status
  from public.daily_plans as plan
  where plan.user_id = p_user_id
    and plan.local_date between v_range_start and v_yesterday
    and plan.approved_at is not null
    and plan.status in ('proposed', 'active', 'closing')
  order by plan.local_date desc, plan.created_at desc
  limit 1;

  v_day_count := v_yesterday - v_range_start + 1;

  if v_day_count = 1
    and v_unresolved_plan_date = v_yesterday
  then
    return jsonb_build_object(
      'state', 'quick_recap',
      'localDate', v_unresolved_plan_date,
      'planStatus', v_unresolved_plan_status,
      'rangeStartDate', v_range_start,
      'rangeEndDate', v_yesterday,
      'dayCount', v_day_count
    );
  end if;

  return jsonb_build_object(
    'state', case
      when v_day_count between 1 and 7 then 'catch_up'
      else 'get_current'
    end,
    'rangeStartDate', v_range_start,
    'rangeEndDate', v_yesterday,
    'dayCount', v_day_count
  );
end;
$$;

revoke all on function private.resolve_return_backlog(uuid, date)
  from public, anon, authenticated;

create function public.get_return_backlog_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_timezone text;
  v_today date;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select profile.timezone
  into v_timezone
  from public.profiles as profile
  where profile.id = v_user_id;

  if v_timezone is null then
    raise exception 'Profile not found';
  end if;

  v_today := (clock_timestamp() at time zone v_timezone)::date;

  return private.resolve_return_backlog(v_user_id, v_today);
end;
$$;

revoke all on function public.get_return_backlog_state()
  from public, anon, authenticated;

grant execute on function public.get_return_backlog_state()
  to authenticated;

create function public.record_return_boundary_v1(
  p_boundary_kind text,
  p_range_start_date date,
  p_range_end_date date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_timezone text;
  v_today date;
  v_state jsonb;
  v_record_id uuid;
  v_existing_kind text;
  v_recorded_at timestamptz := clock_timestamp();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_boundary_kind not in ('catch_up', 'get_current') then
    raise exception 'Return boundary kind is invalid';
  end if;

  select profile.timezone
  into v_timezone
  from public.profiles as profile
  where profile.id = v_user_id
  for update;

  if v_timezone is null then
    raise exception 'Profile not found';
  end if;

  v_today := (v_recorded_at at time zone v_timezone)::date;

  select record.id, record.boundary_kind
  into v_record_id, v_existing_kind
  from public.return_gap_records as record
  where record.user_id = v_user_id
    and record.gap_start_date = p_range_start_date
    and record.gap_end_date = p_range_end_date
  for update;

  if v_record_id is not null then
    if v_existing_kind <> p_boundary_kind then
      raise exception 'This return period was already recorded differently';
    end if;

    return v_record_id;
  end if;

  v_state := private.resolve_return_backlog(v_user_id, v_today);

  if v_state ->> 'state' <> p_boundary_kind then
    raise exception 'The return state has changed';
  end if;

  if (v_state ->> 'rangeStartDate')::date <> p_range_start_date
    or (v_state ->> 'rangeEndDate')::date <> p_range_end_date
  then
    raise exception 'The return date range has changed';
  end if;

  perform plan.id
  from public.daily_plans as plan
  where plan.user_id = v_user_id
    and plan.local_date between p_range_start_date and p_range_end_date
  order by plan.local_date, plan.created_at
  for update;

  perform action.id
  from public.daily_actions as action
  join public.daily_plans as plan
    on plan.id = action.daily_plan_id
    and plan.user_id = action.user_id
  where plan.user_id = v_user_id
    and plan.local_date between p_range_start_date and p_range_end_date
  order by plan.local_date, action.sort_order, action.id
  for update of action;

  v_state := private.resolve_return_backlog(v_user_id, v_today);

  if v_state ->> 'state' <> p_boundary_kind
    or (v_state ->> 'rangeStartDate')::date <> p_range_start_date
    or (v_state ->> 'rangeEndDate')::date <> p_range_end_date
  then
    raise exception 'The return state has changed';
  end if;

  insert into public.return_gap_records (
    user_id,
    gap_start_date,
    gap_end_date,
    context_summary,
    nothing_important,
    boundary_kind,
    recorded_at
  )
  values (
    v_user_id,
    p_range_start_date,
    p_range_end_date,
    null,
    false,
    p_boundary_kind,
    v_recorded_at
  )
  on conflict (user_id, gap_start_date, gap_end_date) do nothing
  returning id into v_record_id;

  if v_record_id is null then
    select record.id, record.boundary_kind
    into v_record_id, v_existing_kind
    from public.return_gap_records as record
    where record.user_id = v_user_id
      and record.gap_start_date = p_range_start_date
      and record.gap_end_date = p_range_end_date;

    if v_record_id is null or v_existing_kind <> p_boundary_kind then
      raise exception 'This return period was already recorded differently';
    end if;
  end if;

  perform private.touch_profile_and_record_event(
    v_user_id,
    'return_boundary_recorded',
    jsonb_build_object(
      'boundaryKind', p_boundary_kind,
      'rangeStartDate', p_range_start_date,
      'rangeEndDate', p_range_end_date
    )
  );

  return v_record_id;
end;
$$;

revoke all on function public.record_return_boundary_v1(text, date, date)
  from public, anon, authenticated;

grant execute on function public.record_return_boundary_v1(text, date, date)
  to authenticated;

create or replace function public.get_latest_return_gap_record()
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_user_id uuid := auth.uid();
  v_record jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select jsonb_build_object(
    'id', record.id,
    'gapStartDate', record.gap_start_date,
    'gapEndDate', record.gap_end_date,
    'contextSummary', record.context_summary,
    'nothingImportant', record.nothing_important,
    'boundaryKind', record.boundary_kind,
    'recordedAt', record.recorded_at
  )
  into v_record
  from public.return_gap_records as record
  where record.user_id = v_user_id
  order by record.gap_end_date desc, record.recorded_at desc
  limit 1;

  return v_record;
end;
$$;

create or replace function public.start_current_day_v2()
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
  v_return_state jsonb;
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
  v_return_state := private.resolve_return_backlog(v_user_id, v_today);

  if v_return_state ->> 'state' = 'quick_recap' then
    return jsonb_build_object(
      'outcome', 'quick_recap_required',
      'previousLocalDate', v_return_state ->> 'localDate',
      'previousPlanStatus', v_return_state ->> 'planStatus'
    );
  end if;

  if v_return_state ->> 'state' = 'catch_up' then
    return jsonb_build_object(
      'outcome', 'catch_up_required',
      'rangeStartDate', v_return_state ->> 'rangeStartDate',
      'rangeEndDate', v_return_state ->> 'rangeEndDate',
      'dayCount', (v_return_state ->> 'dayCount')::integer
    );
  end if;

  if v_return_state ->> 'state' = 'get_current' then
    return jsonb_build_object(
      'outcome', 'get_current_required',
      'rangeStartDate', v_return_state ->> 'rangeStartDate',
      'rangeEndDate', v_return_state ->> 'rangeEndDate',
      'dayCount', (v_return_state ->> 'dayCount')::integer
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
      sleep_outcome = coalesce(sleep_outcome, 'started_without_sleep'),
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

  if v_result ->> 'outcome' = 'quick_recap_required' then
    raise exception 'Resolve the previous approved plan first';
  end if;

  if v_result ->> 'outcome' in ('catch_up_required', 'get_current_required') then
    raise exception 'Record the current return boundary first';
  end if;

  if v_result ->> 'outcome' in ('started', 'current_day_already_started') then
    return (v_result ->> 'planId')::uuid;
  end if;

  raise exception 'Unknown day-start result';
end;
$$;

revoke all on function public.start_current_day_v2()
  from public, anon, authenticated;

grant execute on function public.start_current_day_v2()
  to authenticated;

revoke all on function public.start_current_day()
  from public, anon, authenticated;

grant execute on function public.start_current_day()
  to authenticated;

notify pgrst, 'reload schema';
