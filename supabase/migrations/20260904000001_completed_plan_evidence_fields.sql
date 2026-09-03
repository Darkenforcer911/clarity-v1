alter table public.daily_actions
  add column actual_minutes integer,
  add column details text;

alter table public.daily_actions
  add constraint daily_actions_actual_minutes_evidence_only check (
    actual_minutes is null
    or (
      completion_evidence_only
      and actual_minutes between 1 and 1440
    )
  ),
  add constraint daily_actions_details_evidence_only check (
    details is null
    or (
      completion_evidence_only
      and char_length(btrim(details)) between 1 and 2000
    )
  );

comment on column public.daily_actions.actual_minutes is
  'Actual time spent, in minutes, for user-recorded completion_evidence_only rows. Null means unknown.';
comment on column public.daily_actions.details is
  'Optional user context for a completion_evidence_only row. Null means unknown.';

revoke all on function public.create_completed_plan_evidence(
  uuid,
  text,
  time without time zone
) from public, anon, authenticated;
revoke all on function public.update_completed_plan_evidence(
  uuid,
  text,
  time without time zone
) from public, anon, authenticated;

drop function public.create_completed_plan_evidence(
  uuid,
  text,
  time without time zone
);
drop function public.update_completed_plan_evidence(
  uuid,
  text,
  time without time zone
);

create function public.create_completed_plan_evidence(
  p_daily_plan_id uuid,
  p_title text,
  p_completed_time time without time zone default null,
  p_actual_minutes integer default null,
  p_details text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan public.daily_plans%rowtype;
  v_timezone text;
  v_completed_at timestamptz;
  v_recorded_at timestamptz := clock_timestamp();
  v_action_id uuid := gen_random_uuid();
  v_sort_order integer;
  v_details text := nullif(btrim(p_details), '');
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if nullif(btrim(p_title), '') is null
    or char_length(btrim(p_title)) > 200
  then
    raise exception 'Describe what you completed';
  end if;

  if p_actual_minutes is not null
    and p_actual_minutes not between 1 and 1440
  then
    raise exception 'Actual duration must be between 1 and 1440 minutes';
  end if;

  if v_details is not null and char_length(v_details) > 2000 then
    raise exception 'Details must be 2000 characters or fewer';
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

  if v_plan.status <> 'proposed' or v_plan.approved_at is not null then
    raise exception 'Completed items can only be added before plan approval';
  end if;

  select timezone
  into v_timezone
  from public.profiles
  where id = v_user_id;

  if v_timezone is null then
    raise exception 'Profile timezone not found';
  end if;

  if v_plan.local_date <> (v_recorded_at at time zone v_timezone)::date then
    raise exception 'Today has changed. Return to Today before adding this item';
  end if;

  if p_completed_time is not null then
    v_completed_at :=
      (v_plan.local_date + p_completed_time) at time zone v_timezone;

    if date_trunc('minute', v_completed_at)
      > date_trunc('minute', v_recorded_at)
    then
      raise exception 'Completion time cannot be in the future';
    end if;
  end if;

  select coalesce(max(sort_order), -1) + 1
  into v_sort_order
  from public.daily_actions
  where daily_plan_id = v_plan.id;

  insert into public.daily_actions (
    id,
    user_id,
    daily_plan_id,
    title,
    action_type,
    status,
    estimated_minutes,
    actual_minutes,
    details,
    scheduled_time,
    why_it_exists,
    definition_of_done,
    suggested_method,
    sort_order,
    completed_at,
    completion_recorded_at,
    completion_time_unknown,
    completion_evidence_only
  )
  values (
    v_action_id,
    v_user_id,
    v_plan.id,
    btrim(p_title),
    'flexible',
    'completed',
    0,
    p_actual_minutes,
    v_details,
    null,
    'Recorded by the user as completed evidence.',
    btrim(p_title),
    'Already completed.',
    v_sort_order,
    v_completed_at,
    v_recorded_at,
    v_completed_at is null,
    true
  );

  perform private.touch_profile_and_record_event(
    v_user_id,
    'action_completed',
    jsonb_build_object(
      'dailyPlanId', v_plan.id,
      'dailyActionId', v_action_id,
      'completedEvidenceOnly', true
    )
  );

  return v_action_id;
end;
$$;

create function public.update_completed_plan_evidence(
  p_daily_action_id uuid,
  p_title text,
  p_completed_time time without time zone default null,
  p_actual_minutes integer default null,
  p_details text default null
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
  v_completed_at timestamptz;
  v_recorded_at timestamptz := clock_timestamp();
  v_details text := nullif(btrim(p_details), '');
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if nullif(btrim(p_title), '') is null
    or char_length(btrim(p_title)) > 200
  then
    raise exception 'Describe what you completed';
  end if;

  if p_actual_minutes is not null
    and p_actual_minutes not between 1 and 1440
  then
    raise exception 'Actual duration must be between 1 and 1440 minutes';
  end if;

  if v_details is not null and char_length(v_details) > 2000 then
    raise exception 'Details must be 2000 characters or fewer';
  end if;

  select *
  into v_action
  from public.daily_actions
  where id = p_daily_action_id
    and user_id = v_user_id
  for update;

  if v_action.id is null then
    raise exception 'Completed item not found';
  end if;

  select *
  into v_plan
  from public.daily_plans
  where id = v_action.daily_plan_id
    and user_id = v_user_id
  for update;

  if v_plan.status <> 'proposed'
    or v_plan.approved_at is not null
    or v_action.status <> 'completed'
    or not v_action.completion_evidence_only
    or v_action.approved_at is not null
  then
    raise exception 'Only a completed item in the current proposal can be edited';
  end if;

  select timezone
  into v_timezone
  from public.profiles
  where id = v_user_id;

  if v_timezone is null then
    raise exception 'Profile timezone not found';
  end if;

  if v_plan.local_date <> (v_recorded_at at time zone v_timezone)::date then
    raise exception 'Today has changed. Return to Today before editing this item';
  end if;

  if p_completed_time is not null then
    v_completed_at :=
      (v_plan.local_date + p_completed_time) at time zone v_timezone;

    if date_trunc('minute', v_completed_at)
      > date_trunc('minute', v_recorded_at)
    then
      raise exception 'Completion time cannot be in the future';
    end if;
  end if;

  update public.daily_actions
  set
    title = btrim(p_title),
    definition_of_done = btrim(p_title),
    completed_at = v_completed_at,
    completion_recorded_at = v_recorded_at,
    completion_time_unknown = v_completed_at is null,
    actual_minutes = p_actual_minutes,
    details = v_details
  where id = v_action.id;
end;
$$;

revoke all on function public.create_completed_plan_evidence(
  uuid,
  text,
  time without time zone,
  integer,
  text
) from public, anon;
revoke all on function public.update_completed_plan_evidence(
  uuid,
  text,
  time without time zone,
  integer,
  text
) from public, anon;

grant execute on function public.create_completed_plan_evidence(
  uuid,
  text,
  time without time zone,
  integer,
  text
) to authenticated;
grant execute on function public.update_completed_plan_evidence(
  uuid,
  text,
  time without time zone,
  integer,
  text
) to authenticated;

notify pgrst, 'reload schema';
