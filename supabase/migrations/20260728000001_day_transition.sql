alter table public.daily_plans
  add column record_kind text not null default 'planned';

alter table public.daily_plans
  add constraint daily_plans_record_kind_check check (
    record_kind in ('planned', 'recorded_without_plan', 'skipped')
  );

alter table public.daily_plans
  drop constraint daily_plans_proposed_fields,
  drop constraint daily_plans_approved_fields;

alter table public.daily_plans
  add constraint daily_plans_proposed_fields check (
    record_kind <> 'planned'
    or status = 'unshaped'
    or (
      woke_at is not null
      and aiming_to_sleep_at is not null
      and focus is not null
      and proposed_at is not null
    )
  ),
  add constraint daily_plans_approved_fields check (
    record_kind <> 'planned'
    or status not in ('active', 'closing')
    or approved_at is not null
  ),
  add constraint daily_plans_historical_record_fields check (
    record_kind = 'planned'
    or (
      status = 'closed'
      and woke_at is null
      and aiming_to_sleep_at is null
      and focus is null
      and proposed_at is null
      and approved_at is null
      and closed_at is not null
    )
  );

alter table public.daily_actions
  add column completion_recorded_at timestamptz,
  add column completion_time_unknown boolean not null default false,
  add column reschedule_count integer not null default 0;

update public.daily_actions
set reschedule_count = 1
where status = 'rescheduled';

alter table public.daily_actions
  drop constraint daily_actions_completed_at_matches_status;

alter table public.daily_actions
  add constraint daily_actions_completion_matches_status check (
    (
      status = 'completed'
      and (
        completed_at is not null
        or completion_time_unknown
      )
    )
    or (
      status <> 'completed'
      and completed_at is null
      and not completion_time_unknown
    )
  ),
  add constraint daily_actions_completion_time_is_honest check (
    not (
      completed_at is not null
      and completion_time_unknown
    )
  ),
  add constraint daily_actions_unknown_completion_recorded check (
    not completion_time_unknown
    or completion_recorded_at is not null
  ),
  add constraint daily_actions_reschedule_count_nonnegative check (
    reschedule_count >= 0
  );

create or replace function private.normalize_daily_action_history()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'completed' then
    if new.completed_at is not null then
      new.completion_time_unknown := false;
      new.completion_recorded_at :=
        coalesce(new.completion_recorded_at, new.completed_at);
    elsif new.completion_time_unknown then
      new.completion_recorded_at :=
        coalesce(new.completion_recorded_at, now());
    else
      raise exception 'A completed action needs a completion time or an unknown-time marker';
    end if;
  else
    new.completed_at := null;
    new.completion_time_unknown := false;
    new.completion_recorded_at := null;
  end if;

  if tg_op = 'UPDATE' then
    if new.status = 'rescheduled'
      and (
        old.status <> 'rescheduled'
        or old.rescheduled_for is distinct from new.rescheduled_for
      )
    then
      new.reschedule_count := old.reschedule_count + 1;
    end if;
  end if;

  return new;
end;
$$;

create trigger daily_actions_normalize_history
before insert or update on public.daily_actions
for each row execute function private.normalize_daily_action_history();

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
  v_daily_plan_id uuid;
  v_plan_status public.daily_plan_status;
  v_action_status public.daily_action_status;
  v_completed_at timestamptz := now();
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

  select status
  into v_plan_status
  from public.daily_plans
  where id = v_daily_plan_id
    and user_id = v_user_id
  for update;

  if v_plan_status <> 'active' then
    raise exception 'Actions can only be completed on an active plan';
  end if;

  select status
  into v_action_status
  from public.daily_actions
  where id = p_daily_action_id
    and user_id = v_user_id
  for update;

  if p_completed then
    if v_action_status <> 'active' then
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
    where id = p_daily_action_id;

    perform private.touch_profile_and_record_event(
      v_user_id,
      'action_completed',
      jsonb_build_object(
        'dailyPlanId', v_daily_plan_id,
        'dailyActionId', p_daily_action_id
      )
    );
  else
    if v_action_status <> 'completed' then
      raise exception 'Only a completed action can be returned to active';
    end if;

    update public.daily_actions
    set
      status = 'active',
      completed_at = null,
      completion_recorded_at = null,
      completion_time_unknown = false
    where id = p_daily_action_id;

    update public.profiles
    set last_active_at = now()
    where id = v_user_id;
  end if;
end;
$$;

create or replace function public.record_historical_day(
  p_local_date date,
  p_explanation text default null,
  p_skipped boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_timezone text;
  v_profile_created_date date;
  v_today date;
  v_plan public.daily_plans%rowtype;
  v_plan_id uuid;
  v_record_id uuid;
  v_recorded_at timestamptz := now();
  v_explanation text := nullif(btrim(p_explanation), '');
  v_record_kind text;
  v_progress jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select
    timezone,
    (created_at at time zone timezone)::date
  into
    v_timezone,
    v_profile_created_date
  from public.profiles
  where id = v_user_id;

  if v_timezone is null then
    raise exception 'Profile not found';
  end if;

  v_today := (now() at time zone v_timezone)::date;

  if p_local_date is null
    or p_local_date >= v_today
    or p_local_date < v_profile_created_date
  then
    raise exception 'Historical date is outside the available account history';
  end if;

  if v_explanation is not null and char_length(v_explanation) > 5000 then
    raise exception 'Historical explanation is too long';
  end if;

  if not p_skipped and v_explanation is null then
    raise exception 'Tell Clarity what happened or choose Skip';
  end if;

  select *
  into v_plan
  from public.daily_plans
  where user_id = v_user_id
    and local_date = p_local_date
  for update;

  if v_plan.id is not null and v_plan.status <> 'unshaped' then
    raise exception 'This day already has a plan or record';
  end if;

  v_record_kind := case
    when p_skipped then 'skipped'
    else 'recorded_without_plan'
  end;

  if v_plan.id is null then
    insert into public.daily_plans (
      user_id,
      local_date,
      status,
      record_kind,
      closed_at
    )
    values (
      v_user_id,
      p_local_date,
      'closed',
      v_record_kind,
      v_recorded_at
    )
    returning id into v_plan_id;
  else
    update public.daily_plans
    set
      status = 'closed',
      record_kind = v_record_kind,
      woke_at = null,
      aiming_to_sleep_at = null,
      context_for_today = null,
      focus = null,
      proposed_at = null,
      approved_at = null,
      closed_at = v_recorded_at
    where id = v_plan.id
    returning id into v_plan_id;
  end if;

  v_progress := jsonb_build_object(
    'version', 1,
    'dailyPlanId', v_plan_id,
    'localDate', p_local_date,
    'recordType', v_record_kind,
    'focus', null,
    'completedCount', 0,
    'totalCount', 0,
    'completedActions', '[]'::jsonb,
    'unfinishedActions', '[]'::jsonb,
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
    v_plan_id,
    v_explanation,
    v_progress
  )
  returning id into v_record_id;

  update public.profiles
  set last_active_at = now()
  where id = v_user_id;

  return v_record_id;
end;
$$;

create or replace function public.reconcile_previous_day(
  p_daily_plan_id uuid,
  p_explanation text,
  p_resolutions jsonb
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

create or replace function public.finish_day(
  p_daily_plan_id uuid,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan public.daily_plans%rowtype;
  v_day_record_id uuid;
  v_recorded_at timestamptz := now();
  v_completed_count integer;
  v_total_count integer;
  v_completed_actions jsonb;
  v_unfinished_actions jsonb;
  v_progress_recorded jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_notes is not null and char_length(p_notes) > 5000 then
    raise exception 'Close Day notes are too long';
  end if;

  select *
  into v_plan
  from public.daily_plans
  where id = p_daily_plan_id
    and user_id = v_user_id
  for update;

  if v_plan.id is null then
    raise exception 'Daily plan not found';
  end if;

  if v_plan.status <> 'closing' then
    raise exception 'Only a closing plan can be finished';
  end if;

  perform 1
  from public.daily_actions
  where daily_plan_id = v_plan.id
    and user_id = v_user_id
  for update;

  if exists (
    select 1
    from public.daily_actions
    where daily_plan_id = v_plan.id
      and user_id = v_user_id
      and approved_at is not null
      and status in ('active', 'proposed')
  ) then
    raise exception 'Every unfinished action must be explicitly resolved';
  end if;

  if exists (
    select 1
    from public.daily_actions
    where daily_plan_id = v_plan.id
      and user_id = v_user_id
      and approved_at is not null
      and (
        (status = 'rescheduled' and rescheduled_for is null)
        or (status = 'dropped' and rescheduled_for is not null)
      )
  ) then
    raise exception 'One or more action resolutions are invalid';
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

  v_progress_recorded := jsonb_build_object(
    'version', 1,
    'dailyPlanId', v_plan.id,
    'localDate', v_plan.local_date,
    'recordType', 'planned',
    'focus', v_plan.focus,
    'completedCount', v_completed_count,
    'totalCount', v_total_count,
    'completedActions', v_completed_actions,
    'unfinishedActions', v_unfinished_actions,
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
    nullif(btrim(p_notes), ''),
    v_progress_recorded
  )
  returning id into v_day_record_id;

  update public.daily_plans
  set
    status = 'closed',
    closed_at = v_recorded_at
  where id = v_plan.id;

  perform private.touch_profile_and_record_event(
    v_user_id,
    'day_closed',
    jsonb_build_object(
      'dailyPlanId', v_plan.id,
      'completedCount', v_completed_count,
      'totalCount', v_total_count
    )
  );

  return v_day_record_id;
end;
$$;

revoke all on function public.record_historical_day(date, text, boolean)
  from public, anon;
revoke all on function public.reconcile_previous_day(
  uuid,
  text,
  jsonb
)
  from public, anon;

grant execute on function public.record_historical_day(date, text, boolean)
  to authenticated;
grant execute on function public.reconcile_previous_day(
  uuid,
  text,
  jsonb
)
  to authenticated;
