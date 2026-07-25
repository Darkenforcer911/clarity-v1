create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.daily_plan_status as enum (
  'unshaped',
  'proposed',
  'active',
  'closing',
  'closed'
);

create type public.daily_action_status as enum (
  'proposed',
  'active',
  'completed',
  'rescheduled',
  'removed',
  'dropped'
);

create or replace function public.is_valid_timezone(p_timezone text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from pg_catalog.pg_timezone_names
    where name = p_timezone
  );
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  timezone text not null default 'UTC',
  onboarding_completed boolean not null default false,
  last_active_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_name_length check (name is null or char_length(name) <= 200),
  constraint profiles_timezone_valid check (public.is_valid_timezone(timezone))
);

create table public.daily_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  local_date date not null,
  status public.daily_plan_status not null default 'unshaped',
  woke_at timestamptz,
  aiming_to_sleep_at timestamptz,
  context_for_today text,
  focus text,
  proposed_at timestamptz,
  approved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_plans_user_local_date_key unique (user_id, local_date),
  constraint daily_plans_id_user_id_key unique (id, user_id),
  constraint daily_plans_context_length check (
    context_for_today is null or char_length(context_for_today) <= 2000
  ),
  constraint daily_plans_focus_length check (
    focus is null or char_length(focus) between 1 and 500
  ),
  constraint daily_plans_proposed_fields check (
    status = 'unshaped'
    or (
      woke_at is not null
      and aiming_to_sleep_at is not null
      and focus is not null
      and proposed_at is not null
    )
  ),
  constraint daily_plans_approved_fields check (
    status not in ('active', 'closing', 'closed')
    or approved_at is not null
  ),
  constraint daily_plans_closed_fields check (
    status <> 'closed'
    or closed_at is not null
  )
);

create table public.daily_actions (
  id uuid primary key,
  user_id uuid not null,
  daily_plan_id uuid not null,
  title text not null,
  action_type text not null,
  status public.daily_action_status not null,
  estimated_minutes integer not null,
  scheduled_time timestamptz,
  why_it_exists text not null,
  definition_of_done text not null,
  suggested_method text not null,
  sort_order integer not null,
  completed_at timestamptz,
  rescheduled_for date,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_actions_plan_owner_fkey
    foreign key (daily_plan_id, user_id)
    references public.daily_plans(id, user_id)
    on delete cascade,
  constraint daily_actions_title_length check (char_length(title) between 1 and 200),
  constraint daily_actions_type_length check (char_length(action_type) between 1 and 50),
  constraint daily_actions_estimated_minutes_range check (
    estimated_minutes between 1 and 1440
  ),
  constraint daily_actions_why_length check (
    char_length(why_it_exists) between 1 and 1000
  ),
  constraint daily_actions_definition_length check (
    char_length(definition_of_done) between 1 and 1000
  ),
  constraint daily_actions_method_length check (
    char_length(suggested_method) between 1 and 2000
  ),
  constraint daily_actions_sort_order_nonnegative check (sort_order >= 0),
  constraint daily_actions_completed_at_matches_status check (
    (status = 'completed') = (completed_at is not null)
  ),
  constraint daily_actions_rescheduled_date_matches_status check (
    (
      status = 'rescheduled'
      and rescheduled_for is not null
    )
    or (
      status <> 'rescheduled'
      and rescheduled_for is null
    )
  ),
  constraint daily_actions_resolution_note_length check (
    resolution_note is null or char_length(resolution_note) <= 2000
  )
);

create unique index daily_actions_plan_sort_order_key
  on public.daily_actions (daily_plan_id, sort_order)
  where status <> 'removed';

create table public.day_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  daily_plan_id uuid not null,
  notes text,
  progress_recorded jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint day_records_plan_key unique (daily_plan_id),
  constraint day_records_plan_owner_fkey
    foreign key (daily_plan_id, user_id)
    references public.daily_plans(id, user_id)
    on delete cascade,
  constraint day_records_notes_length check (
    notes is null or char_length(notes) <= 5000
  ),
  constraint day_records_progress_is_object check (
    jsonb_typeof(progress_recorded) = 'object'
  )
);

create table public.product_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_name text not null,
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint product_events_known_name check (
    event_name in (
      'app_opened',
      'day_shaping_started',
      'plan_generated',
      'plan_approved',
      'action_completed',
      'day_closing_started',
      'day_closed'
    )
  ),
  constraint product_events_properties_is_object check (
    jsonb_typeof(properties) = 'object'
  )
);

create index daily_plans_user_status_idx
  on public.daily_plans (user_id, status);

create index daily_actions_user_plan_idx
  on public.daily_actions (user_id, daily_plan_id);

create index daily_actions_plan_status_idx
  on public.daily_actions (daily_plan_id, status);

create index daily_actions_rescheduled_for_idx
  on public.daily_actions (user_id, rescheduled_for)
  where status = 'rescheduled';

create index product_events_user_created_at_idx
  on public.product_events (user_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger daily_plans_set_updated_at
before update on public.daily_plans
for each row execute function public.set_updated_at();

create trigger daily_actions_set_updated_at
before update on public.daily_actions
for each row execute function public.set_updated_at();

create trigger day_records_set_updated_at
before update on public.day_records
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'name', ''),
      nullif(new.raw_user_meta_data ->> 'full_name', '')
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

insert into public.profiles (id, name, created_at, updated_at)
select
  users.id,
  coalesce(
    nullif(users.raw_user_meta_data ->> 'name', ''),
    nullif(users.raw_user_meta_data ->> 'full_name', '')
  ),
  users.created_at,
  now()
from auth.users as users
on conflict (id) do nothing;

alter table public.profiles enable row level security;
alter table public.profiles force row level security;
alter table public.daily_plans enable row level security;
alter table public.daily_plans force row level security;
alter table public.daily_actions enable row level security;
alter table public.daily_actions force row level security;
alter table public.day_records enable row level security;
alter table public.day_records force row level security;
alter table public.product_events enable row level security;
alter table public.product_events force row level security;

create policy "Users can read their own profile"
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);

create policy "Users can update their own profile"
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy "Users can read their own daily plans"
on public.daily_plans
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert their own daily plans"
on public.daily_plans
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own daily plans"
on public.daily_plans
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own daily plans"
on public.daily_plans
for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can read their own daily actions"
on public.daily_actions
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert their own daily actions"
on public.daily_actions
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own daily actions"
on public.daily_actions
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own daily actions"
on public.daily_actions
for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can read their own day records"
on public.day_records
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert their own day records"
on public.day_records
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own day records"
on public.day_records
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own day records"
on public.day_records
for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can read their own product events"
on public.product_events
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert their own product events"
on public.product_events
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create or replace function private.touch_profile_and_record_event(
  p_user_id uuid,
  p_event_name text,
  p_properties jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set last_active_at = now()
  where id = p_user_id;

  if not found then
    raise exception 'Profile not found';
  end if;

  insert into public.product_events (user_id, event_name, properties)
  values (p_user_id, p_event_name, coalesce(p_properties, '{}'::jsonb));
end;
$$;

create or replace function public.record_app_opened(p_timezone text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_valid_timezone(p_timezone) then
    raise exception 'Invalid timezone';
  end if;

  update public.profiles
  set
    timezone = p_timezone,
    last_active_at = now()
  where id = v_user_id;

  if not found then
    raise exception 'Profile not found';
  end if;

  insert into public.product_events (user_id, event_name, properties)
  values (
    v_user_id,
    'app_opened',
    jsonb_build_object('timezone', p_timezone)
  );
end;
$$;

create or replace function public.begin_day_shaping(p_local_date date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan public.daily_plans%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_local_date is null then
    raise exception 'Local date is required';
  end if;

  insert into public.daily_plans (user_id, local_date)
  values (v_user_id, p_local_date)
  on conflict (user_id, local_date) do nothing;

  select *
  into v_plan
  from public.daily_plans
  where user_id = v_user_id
    and local_date = p_local_date
  for update;

  if v_plan.id is null then
    raise exception 'Daily plan not found';
  end if;

  if v_plan.status <> 'unshaped' then
    raise exception 'Day shaping can only begin for an unshaped plan';
  end if;

  perform private.touch_profile_and_record_event(
    v_user_id,
    'day_shaping_started',
    jsonb_build_object(
      'dailyPlanId', v_plan.id,
      'localDate', v_plan.local_date
    )
  );

  return v_plan.id;
end;
$$;

create or replace function public.save_proposed_plan(
  p_local_date date,
  p_woke_at timestamptz,
  p_aiming_to_sleep_at timestamptz,
  p_context_for_today text,
  p_focus text,
  p_actions jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan public.daily_plans%rowtype;
  v_action_count integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_local_date is null
    or p_woke_at is null
    or p_aiming_to_sleep_at is null
    or nullif(btrim(p_focus), '') is null
  then
    raise exception 'Shape Today input and focus are required';
  end if;

  if p_context_for_today is not null
    and char_length(p_context_for_today) > 2000
  then
    raise exception 'Context for today is too long';
  end if;

  if p_actions is null
    or jsonb_typeof(p_actions) <> 'array'
    or jsonb_array_length(p_actions) < 1
    or jsonb_array_length(p_actions) > 12
  then
    raise exception 'A proposed plan must contain between 1 and 12 actions';
  end if;

  select count(*)
  into v_action_count
  from jsonb_to_recordset(p_actions) as action_data(
    "id" uuid,
    "title" text,
    "actionType" text,
    "estimatedMinutes" integer,
    "scheduledTime" timestamptz,
    "whyItExists" text,
    "definitionOfDone" text,
    "suggestedMethod" text,
    "status" text,
    "sortOrder" integer
  )
  where action_data."id" is null
    or nullif(btrim(action_data."title"), '') is null
    or nullif(btrim(action_data."actionType"), '') is null
    or action_data."estimatedMinutes" is null
    or action_data."estimatedMinutes" not between 1 and 1440
    or nullif(btrim(action_data."whyItExists"), '') is null
    or nullif(btrim(action_data."definitionOfDone"), '') is null
    or nullif(btrim(action_data."suggestedMethod"), '') is null
    or action_data."status" is distinct from 'proposed'
    or action_data."sortOrder" is null
    or action_data."sortOrder" < 0;

  if v_action_count > 0 then
    raise exception 'One or more proposed actions are invalid';
  end if;

  select count(*) - count(distinct action_data."id")
  into v_action_count
  from jsonb_to_recordset(p_actions) as action_data("id" uuid);

  if v_action_count > 0 then
    raise exception 'Proposed action IDs must be unique';
  end if;

  select count(*) - count(distinct action_data."sortOrder")
  into v_action_count
  from jsonb_to_recordset(p_actions) as action_data("sortOrder" integer);

  if v_action_count > 0 then
    raise exception 'Proposed action sort orders must be unique';
  end if;

  insert into public.daily_plans (user_id, local_date)
  values (v_user_id, p_local_date)
  on conflict (user_id, local_date) do nothing;

  select *
  into v_plan
  from public.daily_plans
  where user_id = v_user_id
    and local_date = p_local_date
  for update;

  if v_plan.id is null then
    raise exception 'Daily plan not found';
  end if;

  if v_plan.status not in ('unshaped', 'proposed') then
    raise exception 'Only an unshaped or proposed plan can be generated';
  end if;

  delete from public.daily_actions
  where daily_plan_id = v_plan.id
    and user_id = v_user_id
    and status = 'proposed';

  update public.daily_plans
  set
    status = 'proposed',
    woke_at = p_woke_at,
    aiming_to_sleep_at = p_aiming_to_sleep_at,
    context_for_today = nullif(btrim(p_context_for_today), ''),
    focus = btrim(p_focus),
    proposed_at = now(),
    approved_at = null,
    closed_at = null
  where id = v_plan.id;

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
    sort_order
  )
  select
    action_data."id",
    v_user_id,
    v_plan.id,
    btrim(action_data."title"),
    btrim(action_data."actionType"),
    'proposed'::public.daily_action_status,
    action_data."estimatedMinutes",
    action_data."scheduledTime",
    btrim(action_data."whyItExists"),
    btrim(action_data."definitionOfDone"),
    btrim(action_data."suggestedMethod"),
    action_data."sortOrder"
  from jsonb_to_recordset(p_actions) as action_data(
    "id" uuid,
    "title" text,
    "actionType" text,
    "estimatedMinutes" integer,
    "scheduledTime" timestamptz,
    "whyItExists" text,
    "definitionOfDone" text,
    "suggestedMethod" text,
    "status" text,
    "sortOrder" integer
  );

  perform private.touch_profile_and_record_event(
    v_user_id,
    'plan_generated',
    jsonb_build_object(
      'dailyPlanId', v_plan.id,
      'localDate', p_local_date,
      'actionCount', jsonb_array_length(p_actions)
    )
  );

  return v_plan.id;
end;
$$;

create or replace function public.approve_daily_plan(p_daily_plan_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan public.daily_plans%rowtype;
  v_approved_action_count integer;
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
    raise exception 'Daily plan not found';
  end if;

  if v_plan.status <> 'proposed' then
    raise exception 'Only a proposed plan can be approved';
  end if;

  select count(*)
  into v_approved_action_count
  from public.daily_actions
  where daily_plan_id = v_plan.id
    and user_id = v_user_id
    and status = 'proposed';

  if v_approved_action_count < 1 then
    raise exception 'A plan must contain at least one proposed action';
  end if;

  update public.daily_actions
  set status = 'active'
  where daily_plan_id = v_plan.id
    and user_id = v_user_id
    and status = 'proposed';

  update public.daily_plans
  set
    status = 'active',
    approved_at = now()
  where id = v_plan.id;

  perform private.touch_profile_and_record_event(
    v_user_id,
    'plan_approved',
    jsonb_build_object(
      'dailyPlanId', v_plan.id,
      'actionCount', v_approved_action_count
    )
  );
end;
$$;

create or replace function public.remove_proposed_action(
  p_daily_action_id uuid
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

  if v_plan_status <> 'proposed' then
    raise exception 'Actions can only be removed from a proposed plan';
  end if;

  select status
  into v_action_status
  from public.daily_actions
  where id = p_daily_action_id
    and user_id = v_user_id
  for update;

  if v_action_status <> 'proposed' then
    raise exception 'Only a proposed action can be removed';
  end if;

  update public.daily_actions
  set status = 'removed'
  where id = p_daily_action_id;

  update public.profiles
  set last_active_at = now()
  where id = v_user_id;
end;
$$;

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
      completed_at = now(),
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
      completed_at = null
    where id = p_daily_action_id;

    update public.profiles
    set last_active_at = now()
    where id = v_user_id;
  end if;
end;
$$;

create or replace function public.begin_day_closing(p_daily_plan_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan public.daily_plans%rowtype;
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
    raise exception 'Daily plan not found';
  end if;

  if v_plan.status <> 'active' then
    raise exception 'Only an active plan can begin Close Day';
  end if;

  update public.daily_plans
  set status = 'closing'
  where id = v_plan.id;

  perform private.touch_profile_and_record_event(
    v_user_id,
    'day_closing_started',
    jsonb_build_object('dailyPlanId', v_plan.id)
  );
end;
$$;

create or replace function public.resolve_daily_action(
  p_daily_action_id uuid,
  p_outcome text,
  p_selected_date date default null,
  p_resolution_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_daily_plan_id uuid;
  v_plan public.daily_plans%rowtype;
  v_action public.daily_actions%rowtype;
  v_rescheduled_for date;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_resolution_note is not null
    and char_length(p_resolution_note) > 2000
  then
    raise exception 'Resolution note is too long';
  end if;

  select daily_plan_id
  into v_daily_plan_id
  from public.daily_actions
  where id = p_daily_action_id
    and user_id = v_user_id;

  if v_daily_plan_id is null then
    raise exception 'Daily action not found';
  end if;

  select *
  into v_plan
  from public.daily_plans
  where id = v_daily_plan_id
    and user_id = v_user_id
  for update;

  if v_plan.id is null then
    raise exception 'Daily plan not found';
  end if;

  if v_plan.status <> 'closing' then
    raise exception 'Actions can only be resolved during Close Day';
  end if;

  select *
  into v_action
  from public.daily_actions
  where id = p_daily_action_id
    and user_id = v_user_id
  for update;

  if v_action.status not in ('active', 'rescheduled', 'dropped') then
    raise exception 'This action cannot be resolved';
  end if;

  case p_outcome
    when 'tomorrow' then
      v_rescheduled_for := v_plan.local_date + 1;
    when 'choose_date' then
      if p_selected_date is null then
        raise exception 'A selected date is required';
      end if;

      if p_selected_date <= v_plan.local_date then
        raise exception 'The selected date must be after the plan date';
      end if;

      v_rescheduled_for := p_selected_date;
    when 'drop' then
      v_rescheduled_for := null;
    else
      raise exception 'Unknown action resolution';
  end case;

  update public.daily_actions
  set
    status = case
      when p_outcome = 'drop' then 'dropped'::public.daily_action_status
      else 'rescheduled'::public.daily_action_status
    end,
    rescheduled_for = v_rescheduled_for,
    resolution_note = nullif(btrim(p_resolution_note), ''),
    completed_at = null
  where id = p_daily_action_id;

  update public.profiles
  set last_active_at = now()
  where id = v_user_id;
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
      and status in ('active', 'proposed')
  ) then
    raise exception 'Every unfinished action must be explicitly resolved';
  end if;

  if exists (
    select 1
    from public.daily_actions
    where daily_plan_id = v_plan.id
      and user_id = v_user_id
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
    and user_id = v_user_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'title', title
      )
      order by sort_order
    ),
    '[]'::jsonb
  )
  into v_completed_actions
  from public.daily_actions
  where daily_plan_id = v_plan.id
    and user_id = v_user_id
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
    and status in ('rescheduled', 'dropped');

  v_progress_recorded := jsonb_build_object(
    'version', 1,
    'dailyPlanId', v_plan.id,
    'localDate', v_plan.local_date,
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

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.daily_plans from anon, authenticated;
revoke all on table public.daily_actions from anon, authenticated;
revoke all on table public.day_records from anon, authenticated;
revoke all on table public.product_events from anon, authenticated;
grant select on public.profiles to authenticated;
grant select on public.daily_plans to authenticated;
grant select on public.daily_actions to authenticated;
grant select on public.day_records to authenticated;
grant select on public.product_events to authenticated;

revoke all on function public.is_valid_timezone(text) from public, anon;
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function private.touch_profile_and_record_event(uuid, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.record_app_opened(text) from public, anon;
revoke all on function public.begin_day_shaping(date) from public, anon;
revoke all on function public.save_proposed_plan(
  date,
  timestamptz,
  timestamptz,
  text,
  text,
  jsonb
) from public, anon;
revoke all on function public.approve_daily_plan(uuid) from public, anon;
revoke all on function public.remove_proposed_action(uuid) from public, anon;
revoke all on function public.set_action_completion(uuid, boolean)
  from public, anon;
revoke all on function public.begin_day_closing(uuid) from public, anon;
revoke all on function public.resolve_daily_action(uuid, text, date, text)
  from public, anon;
revoke all on function public.finish_day(uuid, text) from public, anon;

grant execute on function public.is_valid_timezone(text) to authenticated;
grant execute on function public.record_app_opened(text) to authenticated;
grant execute on function public.begin_day_shaping(date) to authenticated;
grant execute on function public.save_proposed_plan(
  date,
  timestamptz,
  timestamptz,
  text,
  text,
  jsonb
) to authenticated;
grant execute on function public.approve_daily_plan(uuid) to authenticated;
grant execute on function public.remove_proposed_action(uuid) to authenticated;
grant execute on function public.set_action_completion(uuid, boolean)
  to authenticated;
grant execute on function public.begin_day_closing(uuid) to authenticated;
grant execute on function public.resolve_daily_action(uuid, text, date, text)
  to authenticated;
grant execute on function public.finish_day(uuid, text) to authenticated;
