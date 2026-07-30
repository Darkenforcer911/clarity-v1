drop function public.reconcile_previous_day(uuid, text, jsonb);

create function public.reconcile_previous_day(
  p_daily_plan_id uuid,
  p_explanation text,
  p_resolutions jsonb,
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
  v_timezone text;
  v_today date;
  v_plan public.daily_plans%rowtype;
  v_action public.daily_actions%rowtype;
  v_resolution jsonb;
  v_outcome text;
  v_target_date date;
  v_completed_at timestamptz;
  v_recorded_at timestamptz := now();
  v_explanation text := nullif(btrim(p_explanation), '');
  v_unfinished_count integer;
  v_completed_count integer;
  v_total_count integer;
  v_completed_actions jsonb;
  v_unfinished_actions jsonb;
  v_progress jsonb;
  v_record_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if v_explanation is null then
    raise exception 'Tell Clarity what happened';
  end if;

  if char_length(v_explanation) > 5000 then
    raise exception 'Previous-day explanation is too long';
  end if;

  if jsonb_typeof(p_resolutions) <> 'array' then
    raise exception 'Previous-day resolutions must be an array';
  end if;

  if jsonb_typeof(p_unplanned_progress) <> 'array'
    or jsonb_array_length(p_unplanned_progress) > 20
    or exists (
      select 1
      from jsonb_array_elements(p_unplanned_progress) as item(value)
      where jsonb_typeof(value) <> 'string'
        or char_length(value #>> '{}') not between 1 and 500
    )
  then
    raise exception 'Unplanned progress must be a short list of text records';
  end if;

  if p_context_summary is not null
    and char_length(btrim(p_context_summary)) > 1000
  then
    raise exception 'Catch-up context summary is too long';
  end if;

  if p_ongoing_context_candidate is not null
    and (
      jsonb_typeof(p_ongoing_context_candidate) <> 'object'
      or nullif(btrim(p_ongoing_context_candidate ->> 'label'), '') is null
      or char_length(p_ongoing_context_candidate ->> 'label') > 100
      or nullif(
        btrim(p_ongoing_context_candidate ->> 'sourceText'),
        ''
      ) is null
      or char_length(
        p_ongoing_context_candidate ->> 'sourceText'
      ) > 500
      or (
        p_ongoing_context_candidate ? 'decision'
        and p_ongoing_context_candidate -> 'decision' <> 'null'::jsonb
      )
    )
  then
    raise exception 'Ongoing context candidate is invalid';
  end if;

  select timezone
  into v_timezone
  from public.profiles
  where id = v_user_id;

  if v_timezone is null then
    raise exception 'Profile not found';
  end if;

  v_today := (now() at time zone v_timezone)::date;

  select *
  into v_plan
  from public.daily_plans
  where id = p_daily_plan_id
    and user_id = v_user_id
  for update;

  if v_plan.id is null then
    raise exception 'Previous plan not found';
  end if;

  if v_plan.local_date >= v_today then
    raise exception 'Only an earlier calendar day can be reconciled';
  end if;

  if v_plan.status not in ('proposed', 'active', 'closing') then
    raise exception 'This previous plan no longer needs reconciliation';
  end if;

  if exists (
    select 1
    from public.day_records
    where daily_plan_id = v_plan.id
      and user_id = v_user_id
  ) then
    raise exception 'This previous plan has already been recorded';
  end if;

  perform 1
  from public.daily_actions
  where daily_plan_id = v_plan.id
    and user_id = v_user_id
  for update;

  select count(*)
  into v_unfinished_count
  from public.daily_actions
  where daily_plan_id = v_plan.id
    and user_id = v_user_id
    and approved_at is not null
    and status in ('active', 'rescheduled');

  if jsonb_array_length(p_resolutions) <> v_unfinished_count then
    raise exception 'Choose one outcome for every unfinished action';
  end if;

  for v_action in
    select *
    from public.daily_actions
    where daily_plan_id = v_plan.id
      and user_id = v_user_id
      and approved_at is not null
      and status in ('active', 'rescheduled')
    order by sort_order
  loop
    select value
    into v_resolution
    from jsonb_array_elements(p_resolutions)
    where value ->> 'actionId' = v_action.id::text;

    if v_resolution is null then
      raise exception 'An unfinished action is missing its outcome';
    end if;

    v_outcome := v_resolution ->> 'outcome';
    v_target_date := null;
    v_completed_at := null;

    if v_outcome = 'completed_previous_day' then
      if nullif(v_resolution ->> 'completedAt', '') is not null then
        v_completed_at := (v_resolution ->> 'completedAt')::timestamptz;

        if (v_completed_at at time zone v_timezone)::date <> v_plan.local_date
          or v_completed_at > v_recorded_at
        then
          raise exception 'A reconciled completion time must belong to the previous plan date';
        end if;
      end if;

      update public.daily_actions
      set
        status = 'completed',
        completed_at = v_completed_at,
        completion_recorded_at = v_recorded_at,
        completion_time_unknown = v_completed_at is null,
        rescheduled_for = null,
        resolution_note = 'Recorded during catch-up on ' || v_today::text
      where id = v_action.id;
    elsif v_outcome = 'carry_to_today' then
      update public.daily_actions
      set
        status = 'rescheduled',
        rescheduled_for = v_today,
        resolution_note = concat_ws(
          ' · ',
          'Carried during catch-up on ' || v_today::text,
          nullif(btrim(v_resolution ->> 'blockerReason'), '')
        )
      where id = v_action.id;
    elsif v_outcome = 'choose_future_date' then
      v_target_date := nullif(v_resolution ->> 'targetDate', '')::date;

      if v_target_date is null or v_target_date <= v_today then
        raise exception 'Choose a date after the current local date';
      end if;

      update public.daily_actions
      set
        status = 'rescheduled',
        rescheduled_for = v_target_date,
        resolution_note = concat_ws(
          ' · ',
          'Moved during catch-up on ' || v_today::text,
          nullif(btrim(v_resolution ->> 'blockerReason'), '')
        )
      where id = v_action.id;
    elsif v_outcome = 'drop' then
      update public.daily_actions
      set
        status = 'dropped',
        rescheduled_for = null,
        resolution_note = concat_ws(
          ' · ',
          'Dropped during catch-up on ' || v_today::text,
          nullif(btrim(v_resolution ->> 'blockerReason'), '')
        )
      where id = v_action.id;
    else
      raise exception 'Every unfinished action needs a confirmed outcome';
    end if;
  end loop;

  update public.daily_actions
  set status = 'removed'
  where daily_plan_id = v_plan.id
    and user_id = v_user_id
    and status = 'proposed'
    and approved_at is null;

  if exists (
    select 1
    from public.daily_actions
    where daily_plan_id = v_plan.id
      and user_id = v_user_id
      and approved_at is not null
      and status in ('active', 'proposed')
  ) then
    raise exception 'Every unfinished action must be resolved';
  end if;

  select
    count(*) filter (where status = 'completed'),
    count(*) filter (where status in ('completed', 'rescheduled', 'dropped'))
  into
    v_completed_count,
    v_total_count
  from public.daily_actions
  where daily_plan_id = v_plan.id
    and user_id = v_user_id
    and approved_at is not null;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'title', title,
        'completedAt', completed_at,
        'completionTimeUnknown', completion_time_unknown
      )
      order by completed_at asc nulls last, sort_order
    ),
    '[]'::jsonb
  )
  into v_completed_actions
  from public.daily_actions
  where daily_plan_id = v_plan.id
    and user_id = v_user_id
    and approved_at is not null
    and status = 'completed';

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'title', title,
        'outcome', status::text,
        'rescheduledFor', rescheduled_for
      )
      order by sort_order
    ),
    '[]'::jsonb
  )
  into v_unfinished_actions
  from public.daily_actions
  where daily_plan_id = v_plan.id
    and user_id = v_user_id
    and approved_at is not null
    and status in ('rescheduled', 'dropped');

  v_progress := jsonb_build_object(
    'version', 1,
    'dailyPlanId', v_plan.id,
    'localDate', v_plan.local_date,
    'recordType', 'reconciled',
    'focus', v_plan.focus,
    'completedCount', v_completed_count,
    'totalCount', v_total_count,
    'completedActions', v_completed_actions,
    'unfinishedActions', v_unfinished_actions,
    'unplannedProgress', p_unplanned_progress,
    'contextSummary', nullif(btrim(p_context_summary), ''),
    'ongoingContextCandidate', p_ongoing_context_candidate,
    'explanation', v_explanation,
    'recordedAt', v_recorded_at
  );

  insert into public.day_records (
    user_id,
    daily_plan_id,
    notes,
    progress_recorded
  )
  values (
    v_user_id,
    v_plan.id,
    v_explanation,
    v_progress
  )
  returning id into v_record_id;

  update public.daily_plans
  set
    status = 'closed',
    closed_at = v_recorded_at
  where id = v_plan.id;

  update public.profiles
  set last_active_at = now()
  where id = v_user_id;

  return v_record_id;
end;
$$;

revoke all on function public.reconcile_previous_day(
  uuid,
  text,
  jsonb,
  jsonb,
  text,
  jsonb
)
  from public, anon;

grant execute on function public.reconcile_previous_day(
  uuid,
  text,
  jsonb,
  jsonb,
  text,
  jsonb
)
  to authenticated;
