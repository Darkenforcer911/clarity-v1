create table public.overnight_day_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  local_date date not null,
  day_started_at timestamptz,
  sleep_attempted_at timestamptz,
  sleep_outcome text,
  outcome_reported_at timestamptz,
  reported_wake_at timestamptz,
  interrupted_sleep_reported_at timestamptz,
  attempt_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint overnight_day_states_user_date_key unique (user_id, local_date),
  constraint overnight_day_states_outcome_check check (
    sleep_outcome is null
    or sleep_outcome in (
      'slept',
      'could_not_sleep',
      'woke_unexpectedly',
      'started_without_sleep'
    )
  ),
  constraint overnight_day_states_attempt_count_check check (
    attempt_count >= 0
  ),
  constraint overnight_day_states_attempt_pair_check check (
    (sleep_attempted_at is null and attempt_count = 0)
    or (sleep_attempted_at is not null and attempt_count > 0)
  ),
  constraint overnight_day_states_outcome_pair_check check (
    (sleep_outcome is null and outcome_reported_at is null)
    or (sleep_outcome is not null and outcome_reported_at is not null)
  ),
  constraint overnight_day_states_wake_outcome_check check (
    reported_wake_at is null
    or sleep_outcome = 'slept'
    or interrupted_sleep_reported_at is not null
  )
);

create index overnight_day_states_user_date_idx
  on public.overnight_day_states (user_id, local_date desc);

create trigger overnight_day_states_set_updated_at
before update on public.overnight_day_states
for each row execute function public.set_updated_at();

alter table public.overnight_day_states enable row level security;
alter table public.overnight_day_states force row level security;

create policy "Users can read their own overnight states"
on public.overnight_day_states
for select
to authenticated
using ((select auth.uid()) = user_id);

revoke all on table public.overnight_day_states
  from public, anon, authenticated;

grant select on table public.overnight_day_states
  to authenticated;

create function public.get_current_overnight_state()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_timezone text;
  v_today date;
  v_state public.overnight_day_states%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select timezone
  into v_timezone
  from public.profiles
  where id = v_user_id;

  if v_timezone is null then
    raise exception 'Profile not found';
  end if;

  v_today := (clock_timestamp() at time zone v_timezone)::date;

  select *
  into v_state
  from public.overnight_day_states
  where user_id = v_user_id
    and local_date = v_today;

  if v_state.id is null then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_state.id,
    'localDate', v_state.local_date,
    'dayStartedAt', v_state.day_started_at,
    'sleepAttemptedAt', v_state.sleep_attempted_at,
    'sleepOutcome', v_state.sleep_outcome,
    'outcomeReportedAt', v_state.outcome_reported_at,
    'reportedWakeAt', v_state.reported_wake_at,
    'interruptedSleepReportedAt',
      v_state.interrupted_sleep_reported_at,
    'attemptCount', v_state.attempt_count
  );
end;
$$;

create function public.record_sleep_attempt()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_timezone text;
  v_today date;
  v_now timestamptz := clock_timestamp();
  v_state public.overnight_day_states%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select timezone
  into v_timezone
  from public.profiles
  where id = v_user_id
  for update;

  if v_timezone is null then
    raise exception 'Profile not found';
  end if;

  v_today := (v_now at time zone v_timezone)::date;

  if exists (
    select 1
    from public.daily_plans
    where user_id = v_user_id
      and local_date < v_today
      and status in ('proposed', 'active', 'closing')
  ) then
    raise exception 'Resolve the previous approved plan first';
  end if;

  if exists (
    select 1
    from public.daily_plans
    where user_id = v_user_id
      and local_date = v_today
  ) then
    raise exception 'Today has already started';
  end if;

  select *
  into v_state
  from public.overnight_day_states
  where user_id = v_user_id
    and local_date = v_today
  for update;

  if v_state.day_started_at is not null then
    raise exception 'Today has already started';
  end if;

  if v_state.id is null then
    insert into public.overnight_day_states (
      user_id,
      local_date,
      sleep_attempted_at,
      attempt_count
    )
    values (
      v_user_id,
      v_today,
      v_now,
      1
    )
    returning id into v_state.id;
  else
    update public.overnight_day_states
    set
      sleep_attempted_at = v_now,
      attempt_count = attempt_count + 1
    where id = v_state.id
      and user_id = v_user_id;
  end if;

  update public.profiles
  set last_active_at = v_now
  where id = v_user_id;

  return v_state.id;
end;
$$;

create function public.start_current_day()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_timezone text;
  v_today date;
  v_now timestamptz := clock_timestamp();
  v_state public.overnight_day_states%rowtype;
  v_plan public.daily_plans%rowtype;
  v_started_now boolean := false;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select timezone
  into v_timezone
  from public.profiles
  where id = v_user_id
  for update;

  if v_timezone is null then
    raise exception 'Profile not found';
  end if;

  v_today := (v_now at time zone v_timezone)::date;

  if exists (
    select 1
    from public.daily_plans
    where user_id = v_user_id
      and local_date < v_today
      and status in ('proposed', 'active', 'closing')
  ) then
    raise exception 'Resolve the previous approved plan first';
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
    raise exception 'Day shaping can only begin for an unshaped plan';
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

  return v_plan.id;
end;
$$;

create function public.report_overnight_outcome(
  p_outcome text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_timezone text;
  v_today date;
  v_now timestamptz := clock_timestamp();
  v_state public.overnight_day_states%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_outcome not in (
    'slept',
    'could_not_sleep',
    'woke_unexpectedly'
  ) then
    raise exception 'Unknown overnight outcome';
  end if;

  select timezone
  into v_timezone
  from public.profiles
  where id = v_user_id
  for update;

  if v_timezone is null then
    raise exception 'Profile not found';
  end if;

  v_today := (v_now at time zone v_timezone)::date;

  if exists (
    select 1
    from public.daily_plans
    where user_id = v_user_id
      and local_date < v_today
      and status in ('proposed', 'active', 'closing')
  ) then
    raise exception 'Resolve the previous approved plan first';
  end if;

  if exists (
    select 1
    from public.daily_plans
    where user_id = v_user_id
      and local_date = v_today
  ) then
    raise exception 'Today has already started';
  end if;

  select *
  into v_state
  from public.overnight_day_states
  where user_id = v_user_id
    and local_date = v_today
  for update;

  if v_state.id is null
    or v_state.sleep_attempted_at is null
  then
    raise exception 'No sleep attempt is waiting for an outcome';
  end if;

  if v_state.day_started_at is not null then
    raise exception 'Today has already started';
  end if;

  if v_state.outcome_reported_at is not null
    and v_state.sleep_attempted_at <= v_state.outcome_reported_at
  then
    raise exception 'The sleep attempt has already been resolved';
  end if;

  update public.overnight_day_states
  set
    sleep_outcome = p_outcome,
    outcome_reported_at = v_now,
    reported_wake_at = case
      when p_outcome in ('slept', 'woke_unexpectedly') then v_now
      else reported_wake_at
    end,
    interrupted_sleep_reported_at = case
      when p_outcome = 'woke_unexpectedly' then v_now
      else interrupted_sleep_reported_at
    end
  where id = v_state.id
    and user_id = v_user_id;

  update public.profiles
  set last_active_at = v_now
  where id = v_user_id;

  if p_outcome = 'slept' then
    perform public.start_current_day();
  end if;
end;
$$;

revoke all on function public.get_current_overnight_state()
  from public, anon;
revoke all on function public.record_sleep_attempt()
  from public, anon;
revoke all on function public.start_current_day()
  from public, anon;
revoke all on function public.report_overnight_outcome(text)
  from public, anon;

grant execute on function public.get_current_overnight_state()
  to authenticated;
grant execute on function public.record_sleep_attempt()
  to authenticated;
grant execute on function public.start_current_day()
  to authenticated;
grant execute on function public.report_overnight_outcome(text)
  to authenticated;
