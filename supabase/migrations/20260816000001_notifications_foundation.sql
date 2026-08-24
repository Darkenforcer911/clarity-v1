create type public.notification_delivery_status as enum (
  'pending',
  'processing',
  'retry',
  'sent',
  'failed',
  'cancelled'
);

create or replace function private.canonicalize_calendar_reminder_offsets(
  p_offsets integer[]
)
returns integer[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    array_agg(distinct reminder_offset order by reminder_offset desc),
    '{}'::integer[]
  )
  from unnest(coalesce(p_offsets, '{}'::integer[])) as reminder_offset
  where reminder_offset is not null;
$$;

create or replace function private.calendar_reminder_offsets_are_valid(
  p_offsets integer[],
  p_day_level_only boolean default false
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    p_offsets is not null
    and cardinality(p_offsets) <= 10
    and p_offsets = private.canonicalize_calendar_reminder_offsets(p_offsets)
    and not exists (
      select 1
      from unnest(p_offsets) as reminder_offset
      where reminder_offset <= 0
        or reminder_offset > 43200
        or (
          p_day_level_only
          and reminder_offset % 1440 <> 0
        )
    );
$$;

with normalized_reminders as (
  select coalesce(
    array_agg(distinct reminder_offset order by reminder_offset desc)
      filter (where reminder_offset between 1 and 43200),
    '{}'::integer[]
  ) as offsets,
  commitment.id
  from public.calendar_commitments as commitment
  left join lateral unnest(commitment.reminder_offsets_minutes)
    as reminder_offset on (
      reminder_offset between 1 and 43200
      and (
      commitment.commitment_type <> 'deadline'
      or commitment.deadline_due_time is not null
      or reminder_offset % 1440 = 0
      )
    )
  group by commitment.id
)
update public.calendar_commitments as commitment
set reminder_offsets_minutes = normalized_reminders.offsets
from normalized_reminders
where commitment.id = normalized_reminders.id
  and commitment.reminder_offsets_minutes is distinct from normalized_reminders.offsets;

alter table public.calendar_commitments
  drop constraint calendar_commitments_reminder_capacity,
  add constraint calendar_commitments_id_user_unique unique (id, user_id),
  add constraint calendar_commitments_reminders_valid check (
    private.calendar_reminder_offsets_are_valid(
      reminder_offsets_minutes,
      commitment_type = 'deadline' and deadline_due_time is null
    )
  );

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null,
  p256dh_key text not null,
  auth_key text not null,
  expiration_time timestamptz,
  enabled boolean not null default true,
  user_agent text,
  failure_count integer not null default 0,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_subscriptions_endpoint_unique unique (endpoint),
  constraint push_subscriptions_id_user_unique unique (id, user_id),
  constraint push_subscriptions_endpoint_length check (
    char_length(endpoint) between 1 and 4096
  ),
  constraint push_subscriptions_p256dh_length check (
    char_length(p256dh_key) between 1 and 1024
  ),
  constraint push_subscriptions_auth_length check (
    char_length(auth_key) between 1 and 1024
  ),
  constraint push_subscriptions_user_agent_length check (
    user_agent is null or char_length(user_agent) <= 500
  ),
  constraint push_subscriptions_failure_count_nonnegative check (
    failure_count >= 0
  )
);

create index push_subscriptions_user_enabled_idx
  on public.push_subscriptions (user_id, enabled);

create trigger push_subscriptions_set_updated_at
before update on public.push_subscriptions
for each row execute function public.set_updated_at();

alter table public.push_subscriptions enable row level security;
alter table public.push_subscriptions force row level security;

revoke all on table public.push_subscriptions from public, anon, authenticated;

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  push_subscription_id uuid not null,
  calendar_commitment_id uuid not null,
  occurrence_date date not null,
  reminder_offset_minutes integer not null,
  scheduled_for timestamptz not null,
  status public.notification_delivery_status not null default 'pending',
  attempt_count integer not null default 0,
  next_attempt_at timestamptz,
  lease_expires_at timestamptz,
  sent_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_deliveries_idempotency_unique unique (
    push_subscription_id,
    calendar_commitment_id,
    occurrence_date,
    reminder_offset_minutes
  ),
  constraint notification_deliveries_subscription_owner_fk foreign key (
    push_subscription_id,
    user_id
  ) references public.push_subscriptions(id, user_id) on delete cascade,
  constraint notification_deliveries_commitment_owner_fk foreign key (
    calendar_commitment_id,
    user_id
  ) references public.calendar_commitments(id, user_id) on delete cascade,
  constraint notification_deliveries_offset_valid check (
    reminder_offset_minutes between 1 and 43200
  ),
  constraint notification_deliveries_attempt_count_nonnegative check (
    attempt_count >= 0
  ),
  constraint notification_deliveries_error_code_length check (
    last_error_code is null or char_length(last_error_code) <= 200
  ),
  constraint notification_deliveries_sent_state check (
    (status = 'sent' and sent_at is not null)
    or (status <> 'sent' and sent_at is null)
  )
);

create index notification_deliveries_due_idx
  on public.notification_deliveries (
    status,
    coalesce(next_attempt_at, scheduled_for)
  )
  where status in ('pending', 'retry');

create index notification_deliveries_user_created_idx
  on public.notification_deliveries (user_id, created_at desc);

create trigger notification_deliveries_set_updated_at
before update on public.notification_deliveries
for each row execute function public.set_updated_at();

alter table public.notification_deliveries enable row level security;
alter table public.notification_deliveries force row level security;

revoke all on table public.notification_deliveries from public, anon, authenticated;

create or replace function public.register_push_subscription(
  p_endpoint text,
  p_p256dh_key text,
  p_auth_key text,
  p_expiration_time timestamptz default null,
  p_user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_subscription_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if nullif(btrim(p_endpoint), '') is null
    or char_length(p_endpoint) > 4096
  then
    raise exception 'Push endpoint is invalid';
  end if;

  if nullif(btrim(p_p256dh_key), '') is null
    or char_length(p_p256dh_key) > 1024
    or nullif(btrim(p_auth_key), '') is null
    or char_length(p_auth_key) > 1024
  then
    raise exception 'Push subscription keys are invalid';
  end if;

  if p_user_agent is not null and char_length(p_user_agent) > 500 then
    raise exception 'Push device metadata is too long';
  end if;

  insert into public.push_subscriptions (
    user_id,
    endpoint,
    p256dh_key,
    auth_key,
    expiration_time,
    enabled,
    user_agent,
    failure_count,
    last_failure_at
  )
  values (
    v_user_id,
    btrim(p_endpoint),
    btrim(p_p256dh_key),
    btrim(p_auth_key),
    p_expiration_time,
    true,
    nullif(btrim(p_user_agent), ''),
    0,
    null
  )
  on conflict (endpoint) do update
  set
    p256dh_key = excluded.p256dh_key,
    auth_key = excluded.auth_key,
    expiration_time = excluded.expiration_time,
    enabled = true,
    user_agent = excluded.user_agent,
    failure_count = 0,
    last_failure_at = null
  where push_subscriptions.user_id = excluded.user_id
  returning id into v_subscription_id;

  if v_subscription_id is null then
    raise exception 'Push subscription belongs to another user';
  end if;

  return v_subscription_id;
end;
$$;

create or replace function public.disable_push_subscription(
  p_endpoint text
)
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

  update public.push_subscriptions
  set enabled = false
  where user_id = v_user_id
    and endpoint = p_endpoint;
end;
$$;

create or replace function public.is_push_subscription_enabled(
  p_endpoint text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null then false
    else exists (
      select 1
      from public.push_subscriptions
      where user_id = auth.uid()
        and endpoint = p_endpoint
        and enabled
    )
  end;
$$;

drop function public.create_calendar_commitment(
  public.calendar_commitment_type,
  text,
  date,
  time without time zone,
  time without time zone,
  integer,
  public.calendar_recurrence_preset,
  text
);

create function public.create_calendar_commitment(
  p_commitment_type public.calendar_commitment_type,
  p_title text,
  p_local_date date,
  p_event_start_time time without time zone default null,
  p_deadline_due_time time without time zone default null,
  p_duration_minutes integer default null,
  p_recurrence public.calendar_recurrence_preset default 'none',
  p_details text default null,
  p_reminder_offsets_minutes integer[] default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_timezone text;
  v_commitment_id uuid;
  v_reminder_offsets integer[];
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select timezone
  into v_timezone
  from public.profiles
  where id = v_user_id;

  if v_timezone is null then
    raise exception 'Profile timezone not found';
  end if;

  perform private.validate_calendar_commitment_input(
    p_commitment_type,
    p_title,
    p_event_start_time,
    p_deadline_due_time,
    p_duration_minutes,
    p_details
  );

  v_reminder_offsets := private.canonicalize_calendar_reminder_offsets(
    coalesce(
      p_reminder_offsets_minutes,
      case
        when p_commitment_type = 'event' then array[120]
        else array[1440]
      end
    )
  );

  if not private.calendar_reminder_offsets_are_valid(
    v_reminder_offsets,
    p_commitment_type = 'deadline' and p_deadline_due_time is null
  ) then
    raise exception 'Reminder offsets are invalid for this commitment';
  end if;

  insert into public.calendar_commitments (
    user_id,
    commitment_type,
    title,
    local_date,
    event_start_time,
    deadline_due_time,
    duration_minutes,
    recurrence,
    details,
    timezone,
    reminder_offsets_minutes
  )
  values (
    v_user_id,
    p_commitment_type,
    btrim(p_title),
    p_local_date,
    p_event_start_time,
    p_deadline_due_time,
    p_duration_minutes,
    p_recurrence,
    nullif(btrim(p_details), ''),
    v_timezone,
    v_reminder_offsets
  )
  returning id into v_commitment_id;

  return v_commitment_id;
end;
$$;

drop function public.update_calendar_commitment(
  uuid,
  public.calendar_commitment_type,
  text,
  date,
  time without time zone,
  time without time zone,
  integer,
  public.calendar_recurrence_preset,
  text
);

create function public.update_calendar_commitment(
  p_calendar_commitment_id uuid,
  p_commitment_type public.calendar_commitment_type,
  p_title text,
  p_local_date date,
  p_event_start_time time without time zone default null,
  p_deadline_due_time time without time zone default null,
  p_duration_minutes integer default null,
  p_recurrence public.calendar_recurrence_preset default 'none',
  p_details text default null,
  p_reminder_offsets_minutes integer[] default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing public.calendar_commitments%rowtype;
  v_temporal_change boolean;
  v_new_id uuid;
  v_reminder_offsets integer[];
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_existing
  from public.calendar_commitments
  where id = p_calendar_commitment_id
    and user_id = v_user_id
  for update;

  if v_existing.id is null then
    raise exception 'Calendar commitment not found';
  end if;

  if v_existing.status <> 'scheduled' then
    raise exception 'Only a scheduled commitment can be edited';
  end if;

  perform private.validate_calendar_commitment_input(
    p_commitment_type,
    p_title,
    p_event_start_time,
    p_deadline_due_time,
    p_duration_minutes,
    p_details
  );

  v_reminder_offsets := private.canonicalize_calendar_reminder_offsets(
    coalesce(p_reminder_offsets_minutes, v_existing.reminder_offsets_minutes)
  );

  if p_commitment_type = 'deadline' and p_deadline_due_time is null then
    select coalesce(
      array_agg(reminder_offset order by reminder_offset desc),
      '{}'::integer[]
    )
    into v_reminder_offsets
    from unnest(v_reminder_offsets) as reminder_offset
    where reminder_offset % 1440 = 0;
  end if;

  if not private.calendar_reminder_offsets_are_valid(
    v_reminder_offsets,
    p_commitment_type = 'deadline' and p_deadline_due_time is null
  ) then
    raise exception 'Reminder offsets are invalid for this commitment';
  end if;

  v_temporal_change :=
    v_existing.local_date is distinct from p_local_date
    or v_existing.commitment_type is distinct from p_commitment_type
    or v_existing.event_start_time is distinct from p_event_start_time
    or v_existing.deadline_due_time is distinct from p_deadline_due_time;

  if v_existing.recurrence = 'none'
    and p_recurrence = 'none'
    and v_temporal_change
  then
    update public.calendar_commitments
    set status = 'cancelled'
    where id = v_existing.id;

    insert into public.calendar_commitments (
      user_id,
      commitment_type,
      title,
      local_date,
      event_start_time,
      deadline_due_time,
      duration_minutes,
      recurrence,
      details,
      timezone,
      reminder_offsets_minutes,
      rescheduled_from_id
    )
    values (
      v_user_id,
      p_commitment_type,
      btrim(p_title),
      p_local_date,
      p_event_start_time,
      p_deadline_due_time,
      p_duration_minutes,
      p_recurrence,
      nullif(btrim(p_details), ''),
      v_existing.timezone,
      v_reminder_offsets,
      v_existing.id
    )
    returning id into v_new_id;

    return v_new_id;
  end if;

  update public.calendar_commitments
  set
    commitment_type = p_commitment_type,
    title = btrim(p_title),
    local_date = p_local_date,
    event_start_time = p_event_start_time,
    deadline_due_time = p_deadline_due_time,
    duration_minutes = p_duration_minutes,
    recurrence = p_recurrence,
    details = nullif(btrim(p_details), ''),
    reminder_offsets_minutes = v_reminder_offsets
  where id = v_existing.id;

  return v_existing.id;
end;
$$;

create or replace function public.record_calendar_event_outcome(
  p_calendar_commitment_id uuid,
  p_occurrence_date date,
  p_outcome public.calendar_event_outcome,
  p_outcome_note text default null,
  p_new_date date default null,
  p_new_time time without time zone default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_commitment public.calendar_commitments%rowtype;
  v_timezone text;
  v_now timestamptz := clock_timestamp();
  v_local_date date;
  v_occurs boolean;
  v_replacement_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_commitment
  from public.calendar_commitments
  where id = p_calendar_commitment_id
    and user_id = v_user_id
  for update;

  if v_commitment.id is null then
    raise exception 'Calendar event not found';
  end if;

  if v_commitment.commitment_type <> 'event'
    or v_commitment.status <> 'scheduled'
  then
    raise exception 'Only an unresolved Calendar event can be reconciled';
  end if;

  select timezone
  into v_timezone
  from public.profiles
  where id = v_user_id;

  if v_timezone is null then
    raise exception 'Profile timezone not found';
  end if;

  v_local_date := (v_now at time zone v_timezone)::date;

  if p_occurrence_date <> v_local_date then
    raise exception 'Only an event on the current plan date can be reconciled';
  end if;

  v_occurs :=
    v_commitment.local_date <= p_occurrence_date
    and (
      (v_commitment.recurrence = 'none' and v_commitment.local_date = p_occurrence_date)
      or v_commitment.recurrence = 'daily'
      or (
        v_commitment.recurrence = 'weekly'
        and (p_occurrence_date - v_commitment.local_date) % 7 = 0
      )
      or (
        v_commitment.recurrence = 'fortnightly'
        and (p_occurrence_date - v_commitment.local_date) % 14 = 0
      )
      or (
        v_commitment.recurrence = 'monthly'
        and extract(day from p_occurrence_date)
          = extract(day from v_commitment.local_date)
      )
    );

  if not v_occurs then
    raise exception 'Calendar event does not occur on this date';
  end if;

  if date_trunc(
      'minute',
      (p_occurrence_date + v_commitment.event_start_time)
        at time zone v_timezone
    ) >= date_trunc('minute', v_now)
  then
    raise exception 'The Calendar event time has not passed yet';
  end if;

  if p_outcome_note is not null and char_length(p_outcome_note) > 1000 then
    raise exception 'Outcome note is too long';
  end if;

  if p_outcome = 'rescheduled' then
    if p_new_date is null or p_new_time is null then
      raise exception 'A rescheduled event needs a new date and time';
    end if;

    if date_trunc(
        'minute',
        (p_new_date + p_new_time) at time zone v_timezone
      ) <= date_trunc('minute', v_now)
    then
      raise exception 'The new date and time must be in the future';
    end if;

    insert into public.calendar_commitments (
      user_id,
      commitment_type,
      title,
      local_date,
      event_start_time,
      duration_minutes,
      recurrence,
      details,
      timezone,
      reminder_offsets_minutes,
      rescheduled_from_id
    )
    values (
      v_user_id,
      'event',
      v_commitment.title,
      p_new_date,
      p_new_time,
      v_commitment.duration_minutes,
      'none',
      v_commitment.details,
      v_commitment.timezone,
      v_commitment.reminder_offsets_minutes,
      v_commitment.id
    )
    returning id into v_replacement_id;
  elsif p_new_date is not null or p_new_time is not null then
    raise exception 'A new date and time only apply to rescheduled events';
  end if;

  insert into public.calendar_commitment_occurrences (
    user_id,
    calendar_commitment_id,
    occurrence_date,
    outcome,
    outcome_note,
    replacement_commitment_id
  )
  values (
    v_user_id,
    v_commitment.id,
    p_occurrence_date,
    p_outcome,
    nullif(btrim(p_outcome_note), ''),
    v_replacement_id
  );

  update public.profiles
  set last_active_at = v_now
  where id = v_user_id;

  return v_replacement_id;
end;
$$;

revoke all on function private.canonicalize_calendar_reminder_offsets(integer[])
from public, anon, authenticated;
revoke all on function private.calendar_reminder_offsets_are_valid(integer[], boolean)
from public, anon, authenticated;

revoke all on function public.register_push_subscription(
  text,
  text,
  text,
  timestamptz,
  text
) from public, anon, authenticated;
revoke all on function public.disable_push_subscription(text)
from public, anon, authenticated;
revoke all on function public.is_push_subscription_enabled(text)
from public, anon, authenticated;

revoke all on function public.create_calendar_commitment(
  public.calendar_commitment_type,
  text,
  date,
  time without time zone,
  time without time zone,
  integer,
  public.calendar_recurrence_preset,
  text,
  integer[]
) from public, anon, authenticated;
revoke all on function public.update_calendar_commitment(
  uuid,
  public.calendar_commitment_type,
  text,
  date,
  time without time zone,
  time without time zone,
  integer,
  public.calendar_recurrence_preset,
  text,
  integer[]
) from public, anon, authenticated;

grant execute on function public.register_push_subscription(
  text,
  text,
  text,
  timestamptz,
  text
) to authenticated;
grant execute on function public.disable_push_subscription(text)
to authenticated;
grant execute on function public.is_push_subscription_enabled(text)
to authenticated;
grant execute on function public.create_calendar_commitment(
  public.calendar_commitment_type,
  text,
  date,
  time without time zone,
  time without time zone,
  integer,
  public.calendar_recurrence_preset,
  text,
  integer[]
) to authenticated;
grant execute on function public.update_calendar_commitment(
  uuid,
  public.calendar_commitment_type,
  text,
  date,
  time without time zone,
  time without time zone,
  integer,
  public.calendar_recurrence_preset,
  text,
  integer[]
) to authenticated;

notify pgrst, 'reload schema';
