create function public.reconcile_previous_day_direct_v3(
  p_daily_plan_id uuid,
  p_resolutions jsonb,
  p_extra_context text default null,
  p_unplanned_progress jsonb default '[]'::jsonb,
  p_context_summary text default null,
  p_ongoing_context_candidate jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan public.daily_plans%rowtype;
  v_record public.day_records%rowtype;
  v_unresolved_count integer;
  v_closed_at timestamptz;
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
    raise exception 'Previous plan not found';
  end if;

  select *
  into v_record
  from public.day_records
  where daily_plan_id = v_plan.id
    and user_id = v_user_id;

  select count(*)
  into v_unresolved_count
  from public.daily_actions
  where daily_plan_id = v_plan.id
    and user_id = v_user_id
    and approved_at is not null
    and status in ('active', 'proposed');

  if v_record.id is not null then
    if coalesce(v_record.progress_recorded ->> 'recordType', '')
      <> 'reconciled'
    then
      raise exception 'The existing Day Record is not a Recap record';
    end if;

    if v_unresolved_count > 0 then
      raise exception 'The previous plan still has unresolved approved actions';
    end if;

    if v_plan.status <> 'closed' or v_plan.closed_at is null then
      v_closed_at := coalesce(
        nullif(
          v_record.progress_recorded ->> 'recordedAt',
          ''
        )::timestamptz,
        v_record.created_at,
        clock_timestamp()
      );

      update public.daily_plans
      set
        status = 'closed',
        closed_at = v_closed_at
      where id = v_plan.id
        and user_id = v_user_id;
    end if;

    return v_record.id;
  end if;

  if v_plan.status = 'closed' then
    raise exception 'The closed previous plan has no Day Record';
  end if;

  return public.reconcile_previous_day_direct_v2(
    p_daily_plan_id,
    p_resolutions,
    p_extra_context,
    p_unplanned_progress,
    p_context_summary,
    p_ongoing_context_candidate
  );
end;
$$;

revoke all on function public.reconcile_previous_day_direct_v3(
  uuid,
  jsonb,
  text,
  jsonb,
  text,
  jsonb
)
  from public, anon;

grant execute on function public.reconcile_previous_day_direct_v3(
  uuid,
  jsonb,
  text,
  jsonb,
  text,
  jsonb
)
  to authenticated;

create function public.record_return_gap_v2(
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
  v_latest_gap_end date;
  v_anchor_date date;
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

  select plan.local_date, plan.status::text
  into v_latest_plan_date, v_latest_plan_status
  from public.daily_plans as plan
  where plan.user_id = v_user_id
    and plan.local_date < v_today
  order by plan.local_date desc
  limit 1;

  if v_latest_plan_status in ('proposed', 'active', 'closing') then
    raise exception 'Resolve the previous approved plan first';
  end if;

  if v_latest_plan_status is not null
    and v_latest_plan_status <> 'closed'
  then
    raise exception 'The latest previous plan is not closed';
  end if;

  select max(record.gap_end_date)
  into v_latest_gap_end
  from public.return_gap_records as record
  where record.user_id = v_user_id
    and record.gap_end_date < v_today;

  v_anchor_date := greatest(v_latest_plan_date, v_latest_gap_end);
  v_expected_start := v_anchor_date + 1;
  v_expected_end := v_today - 1;

  if v_anchor_date is null
    or v_expected_start > v_expected_end
  then
    raise exception 'There are no missed dates to record';
  end if;

  if p_gap_start_date <> v_expected_start
    or p_gap_end_date <> v_expected_end
  then
    raise exception 'The missed date range has changed';
  end if;

  if exists (
    select 1
    from public.daily_plans as plan
    where plan.user_id = v_user_id
      and plan.local_date between p_gap_start_date and p_gap_end_date
  ) then
    raise exception 'A daily plan exists inside this missed date range';
  end if;

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

revoke all on function public.record_return_gap_v2(
  date,
  date,
  text,
  boolean
)
  from public, anon;

grant execute on function public.record_return_gap_v2(
  date,
  date,
  text,
  boolean
)
  to authenticated;
