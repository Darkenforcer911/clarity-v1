create function public.record_return_gap_v3(
  p_gap_start_date date,
  p_gap_end_date date,
  p_context_summary text default null,
  p_nothing_important boolean default false
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
  v_latest_plan_date date;
  v_latest_plan_status text;
  v_latest_plan_approved_at timestamptz;
  v_latest_closed_plan_date date;
  v_latest_gap_end date;
  v_resolved_anchor date;
  v_expected_start date;
  v_expected_end date;
  v_context_summary text := nullif(btrim(p_context_summary), '');
  v_saved_context_summary text;
  v_saved_nothing_important boolean;
  v_record_id uuid;
  v_recorded_at timestamptz := clock_timestamp();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_nothing_important is null then
    raise exception 'Gap acknowledgement is required';
  end if;

  if char_length(coalesce(v_context_summary, '')) > 2000 then
    raise exception 'Keep this context under 2,000 characters';
  end if;

  if p_nothing_important and v_context_summary is not null then
    raise exception 'Nothing important cannot include context';
  end if;

  if not p_nothing_important and v_context_summary is null then
    raise exception 'Add context or choose Nothing important happened';
  end if;

  select profile.timezone
  into v_timezone
  from public.profiles as profile
  where profile.id = v_user_id
  for update;

  if v_timezone is null then
    raise exception 'Profile not found';
  end if;

  select
    record.id,
    record.context_summary,
    record.nothing_important
  into
    v_record_id,
    v_saved_context_summary,
    v_saved_nothing_important
  from public.return_gap_records as record
  where record.user_id = v_user_id
    and record.gap_start_date = p_gap_start_date
    and record.gap_end_date = p_gap_end_date
  for update;

  if v_record_id is not null then
    if v_saved_nothing_important is distinct from p_nothing_important
      or v_saved_context_summary is distinct from (
        case
          when p_nothing_important then null
          else v_context_summary
        end
      )
    then
      raise exception 'This missed period was already recorded differently';
    end if;

    return v_record_id;
  end if;

  v_today := (v_recorded_at at time zone v_timezone)::date;
  v_expected_end := v_today - 1;

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
    raise exception 'Resolve the previous approved plan first';
  end if;

  if v_latest_plan_approved_at is null
    and v_latest_plan_status in ('active', 'closing')
  then
    raise exception 'Previous daily plan has an invalid approval state';
  end if;

  select max(plan.local_date)
  into v_latest_closed_plan_date
  from public.daily_plans as plan
  where plan.user_id = v_user_id
    and plan.local_date < v_today
    and plan.status = 'closed';

  select max(record.gap_end_date)
  into v_latest_gap_end
  from public.return_gap_records as record
  where record.user_id = v_user_id
    and record.gap_end_date < v_today;

  v_resolved_anchor := greatest(
    v_latest_closed_plan_date,
    v_latest_gap_end
  );

  if v_resolved_anchor is not null then
    v_expected_start := v_resolved_anchor + 1;
  elsif v_latest_plan_status in ('unshaped', 'proposed') then
    v_expected_start := v_latest_plan_date;
  else
    v_expected_start := v_expected_end;
  end if;

  if v_expected_start > v_expected_end then
    raise exception 'There are no missed dates to record';
  end if;

  if p_gap_start_date <> v_expected_start
    or p_gap_end_date <> v_expected_end
  then
    raise exception 'The missed date range has changed';
  end if;

  perform plan.id
  from public.daily_plans as plan
  where plan.user_id = v_user_id
    and plan.local_date between p_gap_start_date and p_gap_end_date
  order by plan.local_date
  for update;

  if exists (
    select 1
    from public.daily_plans as plan
    where plan.user_id = v_user_id
      and plan.local_date between p_gap_start_date and p_gap_end_date
      and (
        plan.approved_at is not null
        or plan.status not in ('unshaped', 'proposed')
      )
  ) then
    raise exception 'A resolved or approved daily plan exists inside this missed date range';
  end if;

  if exists (
    select 1
    from public.daily_actions as action
    join public.daily_plans as plan
      on plan.id = action.daily_plan_id
      and plan.user_id = action.user_id
    where plan.user_id = v_user_id
      and plan.local_date between p_gap_start_date and p_gap_end_date
      and (
        action.approved_at is not null
        or action.status not in ('proposed', 'removed')
      )
  ) then
    raise exception 'An approved or active action exists inside this missed date range';
  end if;

  update public.daily_actions as action
  set
    status = 'removed',
    completed_at = null,
    completion_recorded_at = null,
    completion_time_unknown = false,
    rescheduled_for = null
  from public.daily_plans as plan
  where plan.id = action.daily_plan_id
    and plan.user_id = action.user_id
    and plan.user_id = v_user_id
    and plan.local_date between p_gap_start_date and p_gap_end_date
    and action.approved_at is null
    and action.status = 'proposed';

  update public.daily_plans as plan
  set
    status = 'closed',
    record_kind = case
      when p_nothing_important then 'skipped'
      else 'recorded_without_plan'
    end,
    woke_at = null,
    aiming_to_sleep_at = null,
    context_for_today = null,
    focus = null,
    proposed_at = null,
    approved_at = null,
    closed_at = v_recorded_at
  where plan.user_id = v_user_id
    and plan.local_date between p_gap_start_date and p_gap_end_date
    and plan.approved_at is null
    and plan.status in ('unshaped', 'proposed');

  insert into public.return_gap_records (
    user_id,
    gap_start_date,
    gap_end_date,
    context_summary,
    nothing_important,
    recorded_at
  )
  values (
    v_user_id,
    p_gap_start_date,
    p_gap_end_date,
    case
      when p_nothing_important then null
      else v_context_summary
    end,
    p_nothing_important,
    v_recorded_at
  )
  returning id into v_record_id;

  update public.profiles
  set last_active_at = v_recorded_at
  where id = v_user_id;

  return v_record_id;
end;
$$;

revoke all on function public.record_return_gap_v3(
  date,
  date,
  text,
  boolean
)
  from public, anon;

grant execute on function public.record_return_gap_v3(
  date,
  date,
  text,
  boolean
)
  to authenticated;
