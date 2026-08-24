create index calendar_commitments_notification_candidates_idx
  on public.calendar_commitments (status, local_date)
  where status = 'scheduled'
    and cardinality(reminder_offsets_minutes) > 0;

create index notification_deliveries_processing_lease_idx
  on public.notification_deliveries (lease_expires_at)
  where status = 'processing';

create or replace function private.calendar_commitment_occurs_on_date(
  p_start_date date,
  p_recurrence public.calendar_recurrence_preset,
  p_occurrence_date date
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    p_occurrence_date >= p_start_date
    and case p_recurrence
      when 'none' then p_occurrence_date = p_start_date
      when 'daily' then true
      when 'weekly' then (p_occurrence_date - p_start_date) % 7 = 0
      when 'fortnightly' then (p_occurrence_date - p_start_date) % 14 = 0
      when 'monthly' then extract(day from p_occurrence_date)
        = extract(day from p_start_date)
      else false
    end;
$$;

create or replace function private.notification_delivery_schedule(
  p_commitment_type public.calendar_commitment_type,
  p_occurrence_date date,
  p_event_start_time time without time zone,
  p_deadline_due_time time without time zone,
  p_timezone text,
  p_reminder_offset_minutes integer
)
returns table (
  scheduled_for timestamptz,
  useful_until timestamptz
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_actual_at timestamptz;
begin
  if p_reminder_offset_minutes <= 0 then
    raise exception 'Reminder offset must be positive';
  end if;

  if p_commitment_type = 'deadline' and p_deadline_due_time is null then
    if p_reminder_offset_minutes % 1440 <> 0 then
      raise exception 'Date-only deadline reminders must use whole days';
    end if;

    -- 09:00 is the delivery convention on the reminder day. It is not a
    -- fabricated deadline time; the date-only deadline remains date-only.
    scheduled_for := (
      p_occurrence_date - (p_reminder_offset_minutes / 1440)
      + time '09:00'
    ) at time zone p_timezone;
    useful_until := scheduled_for + interval '2 hours';
    return next;
    return;
  end if;

  v_actual_at := (
    p_occurrence_date
    + case p_commitment_type
      when 'event' then p_event_start_time
      else p_deadline_due_time
    end
  ) at time zone p_timezone;

  scheduled_for := v_actual_at
    - make_interval(mins => p_reminder_offset_minutes);
  useful_until := least(scheduled_for + interval '2 hours', v_actual_at);
  return next;
end;
$$;

create or replace function public.materialize_notification_deliveries(
  p_now timestamptz default clock_timestamp()
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_materialized integer := 0;
begin
  insert into public.notification_deliveries (
    user_id,
    push_subscription_id,
    calendar_commitment_id,
    occurrence_date,
    reminder_offset_minutes,
    scheduled_for
  )
  select
    commitment.user_id,
    subscription.id,
    commitment.id,
    candidate.occurrence_date,
    reminder.reminder_offset_minutes,
    schedule.scheduled_for
  from public.calendar_commitments as commitment
  join public.push_subscriptions as subscription
    on subscription.user_id = commitment.user_id
    and subscription.enabled
    and (
      subscription.expiration_time is null
      or subscription.expiration_time > p_now
    )
  cross join lateral (
    select (
      (p_now at time zone commitment.timezone)::date + day_offset
    )::date as occurrence_date
    from generate_series(0, 30) as day_offset
  ) as candidate
  cross join lateral unnest(commitment.reminder_offsets_minutes)
    as reminder(reminder_offset_minutes)
  cross join lateral private.notification_delivery_schedule(
    commitment.commitment_type,
    candidate.occurrence_date,
    commitment.event_start_time,
    commitment.deadline_due_time,
    commitment.timezone,
    reminder.reminder_offset_minutes
  ) as schedule
  where commitment.status = 'scheduled'
    and private.calendar_commitment_occurs_on_date(
      commitment.local_date,
      commitment.recurrence,
      candidate.occurrence_date
    )
    and not exists (
      select 1
      from public.calendar_commitment_occurrences as occurrence
      where occurrence.calendar_commitment_id = commitment.id
        and occurrence.occurrence_date = candidate.occurrence_date
    )
    and schedule.scheduled_for <= p_now
    and schedule.scheduled_for > p_now - interval '2 hours'
    and p_now < schedule.useful_until
  on conflict (
    push_subscription_id,
    calendar_commitment_id,
    occurrence_date,
    reminder_offset_minutes
  ) do update
  set
    scheduled_for = excluded.scheduled_for,
    status = 'pending',
    attempt_count = 0,
    next_attempt_at = null,
    lease_expires_at = null,
    sent_at = null,
    last_error_code = null
  where notification_deliveries.sent_at is null
    and (
      notification_deliveries.status = 'cancelled'
      or (
        notification_deliveries.status in ('pending', 'retry', 'failed')
        and notification_deliveries.scheduled_for
          is distinct from excluded.scheduled_for
      )
    );

  get diagnostics v_materialized = row_count;
  return v_materialized;
end;
$$;

create or replace function public.claim_notification_deliveries(
  p_now timestamptz default clock_timestamp(),
  p_batch_size integer default 25,
  p_lease_seconds integer default 300
)
returns table (delivery_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_batch_size not between 1 and 100 then
    raise exception 'Notification batch size must be between 1 and 100';
  end if;

  if p_lease_seconds not between 30 and 900 then
    raise exception 'Notification lease must be between 30 and 900 seconds';
  end if;

  update public.notification_deliveries
  set
    status = 'failed',
    lease_expires_at = null,
    next_attempt_at = null,
    last_error_code = 'retry_limit'
  where attempt_count >= 3
    and (
      status = 'retry'
      or (
        status = 'processing'
        and lease_expires_at <= p_now
      )
    );

  return query
  with claimable as (
    select delivery.id
    from public.notification_deliveries as delivery
    where delivery.sent_at is null
      and delivery.attempt_count < 3
      and (
        (
          delivery.status = 'pending'
          and delivery.scheduled_for <= p_now
        )
        or (
          delivery.status = 'retry'
          and delivery.next_attempt_at <= p_now
        )
        or (
          delivery.status = 'processing'
          and delivery.lease_expires_at <= p_now
        )
      )
    order by coalesce(delivery.next_attempt_at, delivery.scheduled_for), delivery.id
    for update skip locked
    limit p_batch_size
  )
  update public.notification_deliveries as delivery
  set
    status = 'processing',
    attempt_count = delivery.attempt_count + 1,
    next_attempt_at = null,
    lease_expires_at = p_now + make_interval(secs => p_lease_seconds),
    last_error_code = null
  from claimable
  where delivery.id = claimable.id
  returning delivery.id;
end;
$$;

create or replace function public.revalidate_notification_delivery(
  p_delivery_id uuid,
  p_now timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivery public.notification_deliveries%rowtype;
  v_commitment public.calendar_commitments%rowtype;
  v_subscription public.push_subscriptions%rowtype;
  v_scheduled_for timestamptz;
  v_useful_until timestamptz;
  v_valid boolean;
begin
  select *
  into v_delivery
  from public.notification_deliveries
  where id = p_delivery_id
  for update;

  if v_delivery.id is null
    or v_delivery.status <> 'processing'
    or v_delivery.sent_at is not null
    or v_delivery.lease_expires_at is null
    or v_delivery.lease_expires_at <= p_now
  then
    return null;
  end if;

  select *
  into v_commitment
  from public.calendar_commitments
  where id = v_delivery.calendar_commitment_id
    and user_id = v_delivery.user_id
  for update;

  select *
  into v_subscription
  from public.push_subscriptions
  where id = v_delivery.push_subscription_id
    and user_id = v_delivery.user_id
  for update;

  if v_commitment.id is not null then
    select schedule.scheduled_for, schedule.useful_until
    into v_scheduled_for, v_useful_until
    from private.notification_delivery_schedule(
      v_commitment.commitment_type,
      v_delivery.occurrence_date,
      v_commitment.event_start_time,
      v_commitment.deadline_due_time,
      v_commitment.timezone,
      v_delivery.reminder_offset_minutes
    ) as schedule;
  end if;

  v_valid :=
    v_commitment.id is not null
    and v_subscription.id is not null
    and v_commitment.status = 'scheduled'
    and v_subscription.enabled
    and (
      v_subscription.expiration_time is null
      or v_subscription.expiration_time > p_now
    )
    and v_delivery.reminder_offset_minutes
      = any(v_commitment.reminder_offsets_minutes)
    and private.calendar_commitment_occurs_on_date(
      v_commitment.local_date,
      v_commitment.recurrence,
      v_delivery.occurrence_date
    )
    and not exists (
      select 1
      from public.calendar_commitment_occurrences as occurrence
      where occurrence.calendar_commitment_id = v_commitment.id
        and occurrence.occurrence_date = v_delivery.occurrence_date
    )
    and v_scheduled_for = v_delivery.scheduled_for
    and v_delivery.scheduled_for <= p_now
    and p_now < v_useful_until;

  if not coalesce(v_valid, false) then
    update public.notification_deliveries
    set
      status = 'cancelled',
      lease_expires_at = null,
      next_attempt_at = null,
      last_error_code = 'stale_or_ineligible'
    where id = v_delivery.id
      and status = 'processing';
    return null;
  end if;

  return jsonb_build_object(
    'deliveryId', v_delivery.id,
    'attemptCount', v_delivery.attempt_count,
    'endpoint', v_subscription.endpoint,
    'p256dhKey', v_subscription.p256dh_key,
    'authKey', v_subscription.auth_key,
    'commitmentId', v_commitment.id,
    'commitmentType', v_commitment.commitment_type,
    'title', v_commitment.title,
    'occurrenceDate', v_delivery.occurrence_date,
    'reminderOffsetMinutes', v_delivery.reminder_offset_minutes,
    'scheduledFor', v_delivery.scheduled_for,
    'usefulUntil', v_useful_until
  );
end;
$$;

create or replace function public.record_notification_delivery_success(
  p_delivery_id uuid,
  p_now timestamptz default clock_timestamp()
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subscription_id uuid;
begin
  update public.notification_deliveries
  set
    status = 'sent',
    sent_at = p_now,
    lease_expires_at = null,
    next_attempt_at = null,
    last_error_code = null
  where id = p_delivery_id
    and status = 'processing'
    and sent_at is null
  returning push_subscription_id into v_subscription_id;

  if v_subscription_id is null then
    return false;
  end if;

  update public.push_subscriptions
  set
    failure_count = 0,
    last_success_at = p_now,
    last_failure_at = null
  where id = v_subscription_id;

  return true;
end;
$$;

create or replace function public.record_notification_delivery_failure(
  p_delivery_id uuid,
  p_error_code text,
  p_disable_subscription boolean default false,
  p_retry_at timestamptz default null,
  p_now timestamptz default clock_timestamp()
)
returns public.notification_delivery_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivery public.notification_deliveries%rowtype;
  v_commitment public.calendar_commitments%rowtype;
  v_useful_until timestamptz;
  v_final_status public.notification_delivery_status;
begin
  if nullif(btrim(p_error_code), '') is null
    or char_length(p_error_code) > 200
  then
    raise exception 'A safe delivery error code is required';
  end if;

  select *
  into v_delivery
  from public.notification_deliveries
  where id = p_delivery_id
  for update;

  if v_delivery.id is null or v_delivery.status <> 'processing' then
    return null;
  end if;

  select *
  into v_commitment
  from public.calendar_commitments
  where id = v_delivery.calendar_commitment_id;

  if v_commitment.id is not null then
    select schedule.useful_until
    into v_useful_until
    from private.notification_delivery_schedule(
      v_commitment.commitment_type,
      v_delivery.occurrence_date,
      v_commitment.event_start_time,
      v_commitment.deadline_due_time,
      v_commitment.timezone,
      v_delivery.reminder_offset_minutes
    ) as schedule;
  end if;

  v_final_status := case
    when p_disable_subscription then 'failed'
    when p_retry_at is null then 'failed'
    when v_delivery.attempt_count >= 3 then 'failed'
    when v_useful_until is null or p_retry_at >= v_useful_until then 'failed'
    else 'retry'
  end;

  update public.notification_deliveries
  set
    status = v_final_status,
    next_attempt_at = case
      when v_final_status = 'retry' then p_retry_at
      else null
    end,
    lease_expires_at = null,
    last_error_code = btrim(p_error_code)
  where id = v_delivery.id;

  update public.push_subscriptions
  set
    enabled = case when p_disable_subscription then false else enabled end,
    failure_count = failure_count + 1,
    last_failure_at = p_now
  where id = v_delivery.push_subscription_id;

  return v_final_status;
end;
$$;

revoke all on function private.calendar_commitment_occurs_on_date(
  date,
  public.calendar_recurrence_preset,
  date
) from public, anon, authenticated;
revoke all on function private.notification_delivery_schedule(
  public.calendar_commitment_type,
  date,
  time without time zone,
  time without time zone,
  text,
  integer
) from public, anon, authenticated;

revoke all on function public.materialize_notification_deliveries(timestamptz)
from public, anon, authenticated;
revoke all on function public.claim_notification_deliveries(
  timestamptz,
  integer,
  integer
) from public, anon, authenticated;
revoke all on function public.revalidate_notification_delivery(uuid, timestamptz)
from public, anon, authenticated;
revoke all on function public.record_notification_delivery_success(uuid, timestamptz)
from public, anon, authenticated;
revoke all on function public.record_notification_delivery_failure(
  uuid,
  text,
  boolean,
  timestamptz,
  timestamptz
) from public, anon, authenticated;

grant execute on function public.materialize_notification_deliveries(timestamptz)
to service_role;
grant execute on function public.claim_notification_deliveries(
  timestamptz,
  integer,
  integer
) to service_role;
grant execute on function public.revalidate_notification_delivery(uuid, timestamptz)
to service_role;
grant execute on function public.record_notification_delivery_success(uuid, timestamptz)
to service_role;
grant execute on function public.record_notification_delivery_failure(
  uuid,
  text,
  boolean,
  timestamptz,
  timestamptz
) to service_role;

notify pgrst, 'reload schema';
