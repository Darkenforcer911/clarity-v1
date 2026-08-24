update public.calendar_commitments
set
  recurrence_unit = case recurrence
    when 'daily' then 'day'::public.calendar_recurrence_unit
    when 'weekly' then 'week'::public.calendar_recurrence_unit
    when 'fortnightly' then 'week'::public.calendar_recurrence_unit
    when 'monthly' then 'month'::public.calendar_recurrence_unit
    when 'yearly' then 'year'::public.calendar_recurrence_unit
    else null
  end,
  recurrence_interval = case recurrence
    when 'fortnightly' then 2
    else 1
  end,
  recurrence_weekdays = case
    when recurrence in ('weekly', 'fortnightly')
      then array[extract(isodow from local_date)::smallint]
    else '{}'::smallint[]
  end
where recurrence_unit is null
  and recurrence <> 'none';

create function private.calendar_recurrence_rule_is_valid(
  p_recurrence public.calendar_recurrence_preset,
  p_unit public.calendar_recurrence_unit,
  p_interval smallint,
  p_weekdays smallint[]
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    p_interval between 1 and 999
    and p_weekdays is not null
    and p_weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]
    and cardinality(p_weekdays) <= 7
    and cardinality(p_weekdays) = (
      select count(distinct weekday)::integer
      from unnest(p_weekdays) as weekday
    )
    and (
      (
        p_recurrence = 'none'
        and p_unit is null
        and p_interval = 1
        and cardinality(p_weekdays) = 0
      )
      or (
        p_recurrence = 'daily'
        and p_unit = 'day'
        and cardinality(p_weekdays) = 0
      )
      or (
        p_recurrence in ('weekly', 'fortnightly')
        and p_unit = 'week'
        and (p_recurrence <> 'fortnightly' or p_interval = 2)
        and cardinality(p_weekdays) between 1 and 7
      )
      or (
        p_recurrence = 'monthly'
        and p_unit = 'month'
        and cardinality(p_weekdays) = 0
      )
      or (
        p_recurrence = 'yearly'
        and p_unit = 'year'
        and cardinality(p_weekdays) = 0
      )
    );
$$;

alter table public.calendar_commitments
  add constraint calendar_commitments_recurrence_rule_valid check (
    private.calendar_recurrence_rule_is_valid(
      recurrence,
      recurrence_unit,
      recurrence_interval,
      recurrence_weekdays
    )
  );

create or replace function private.calendar_commitment_occurs_on_date(
  p_start_date date,
  p_unit public.calendar_recurrence_unit,
  p_interval smallint,
  p_weekdays smallint[],
  p_occurrence_date date
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    p_occurrence_date >= p_start_date
    and case p_unit
      when 'day' then
        (p_occurrence_date - p_start_date) % p_interval = 0
      when 'week' then
        (
          (
            date_trunc('week', p_occurrence_date::timestamp)::date
            - date_trunc('week', p_start_date::timestamp)::date
          ) / 7
        ) % p_interval = 0
        and extract(isodow from p_occurrence_date)::smallint = any(p_weekdays)
      when 'month' then
        (
          (
            extract(year from p_occurrence_date)::integer * 12
            + extract(month from p_occurrence_date)::integer
          )
          - (
            extract(year from p_start_date)::integer * 12
            + extract(month from p_start_date)::integer
          )
        ) % p_interval = 0
        and extract(day from p_occurrence_date) = extract(day from p_start_date)
      when 'year' then
        (
          extract(year from p_occurrence_date)::integer
          - extract(year from p_start_date)::integer
        ) % p_interval = 0
        and extract(month from p_occurrence_date) = extract(month from p_start_date)
        and extract(day from p_occurrence_date) = extract(day from p_start_date)
      else p_occurrence_date = p_start_date
    end;
$$;

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
  select p_occurrence_date >= p_start_date
    and case p_recurrence
      when 'none' then p_occurrence_date = p_start_date
      when 'daily' then true
      when 'weekly' then (p_occurrence_date - p_start_date) % 7 = 0
      when 'fortnightly' then (p_occurrence_date - p_start_date) % 14 = 0
      when 'monthly' then extract(day from p_occurrence_date) = extract(day from p_start_date)
      when 'yearly' then
        extract(month from p_occurrence_date) = extract(month from p_start_date)
        and extract(day from p_occurrence_date) = extract(day from p_start_date)
      else false
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
  text,
  integer[]
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
  p_reminder_offsets_minutes integer[] default null,
  p_recurrence_unit public.calendar_recurrence_unit default null,
  p_recurrence_interval smallint default 1,
  p_recurrence_weekdays smallint[] default '{}'
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
  v_unit public.calendar_recurrence_unit := p_recurrence_unit;
  v_interval smallint := coalesce(p_recurrence_interval, 1);
  v_weekdays smallint[] := coalesce(p_recurrence_weekdays, '{}'::smallint[]);
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select timezone into v_timezone
  from public.profiles where id = v_user_id;
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

  if p_recurrence_unit is null and p_recurrence <> 'none' then
    v_unit := case p_recurrence
      when 'daily' then 'day'::public.calendar_recurrence_unit
      when 'weekly' then 'week'::public.calendar_recurrence_unit
      when 'fortnightly' then 'week'::public.calendar_recurrence_unit
      when 'monthly' then 'month'::public.calendar_recurrence_unit
      when 'yearly' then 'year'::public.calendar_recurrence_unit
      else null
    end;
    v_interval := case when p_recurrence = 'fortnightly' then 2 else 1 end;
    if v_unit = 'week' then
      v_weekdays := array[extract(isodow from p_local_date)::smallint];
    end if;
  end if;

  if not private.calendar_recurrence_rule_is_valid(
    p_recurrence, v_unit, v_interval, v_weekdays
  ) then
    raise exception 'Calendar recurrence rule is invalid';
  end if;

  v_reminder_offsets := private.canonicalize_calendar_reminder_offsets(
    coalesce(
      p_reminder_offsets_minutes,
      case when p_commitment_type = 'event' then array[120] else array[1440] end
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
    recurrence_unit,
    recurrence_interval,
    recurrence_weekdays,
    details,
    timezone,
    reminder_offsets_minutes
  ) values (
    v_user_id,
    p_commitment_type,
    btrim(p_title),
    p_local_date,
    p_event_start_time,
    p_deadline_due_time,
    p_duration_minutes,
    p_recurrence,
    v_unit,
    v_interval,
    v_weekdays,
    nullif(btrim(p_details), ''),
    v_timezone,
    v_reminder_offsets
  ) returning id into v_commitment_id;

  return v_commitment_id;
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
  v_occurrence public.calendar_commitment_occurrences%rowtype;
  v_timezone text;
  v_now timestamptz := clock_timestamp();
  v_local_date date;
  v_replacement_id uuid;
  v_outcome_note text := nullif(btrim(p_outcome_note), '');
  v_completed_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_commitment
  from public.calendar_commitments
  where id = p_calendar_commitment_id and user_id = v_user_id
  for update;

  if v_commitment.id is null then
    raise exception 'Calendar event not found';
  end if;
  if v_commitment.commitment_type <> 'event'
    or v_commitment.status <> 'scheduled'
  then
    raise exception 'Only an unresolved Calendar event can be reconciled';
  end if;
  if p_outcome is null then
    raise exception 'Choose a Calendar event outcome';
  end if;

  select * into v_occurrence
  from public.calendar_commitment_occurrences
  where calendar_commitment_id = v_commitment.id
    and user_id = v_user_id
    and occurrence_date = p_occurrence_date
  for update;

  if v_occurrence.id is not null and v_occurrence.outcome is not null then
    raise exception 'Calendar event outcome already recorded';
  end if;

  select timezone into v_timezone
  from public.profiles where id = v_user_id;
  if v_timezone is null then
    raise exception 'Profile timezone not found';
  end if;

  v_local_date := (v_now at time zone v_timezone)::date;
  if p_occurrence_date <> v_local_date then
    raise exception 'Only an event on the current plan date can be reconciled';
  end if;

  if not private.calendar_commitment_occurs_on_date(
    v_commitment.local_date,
    v_commitment.recurrence_unit,
    v_commitment.recurrence_interval,
    v_commitment.recurrence_weekdays,
    p_occurrence_date
  ) then
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
  if p_outcome = 'attended' then
    v_completed_at := v_now;
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
      recurrence_unit,
      recurrence_interval,
      recurrence_weekdays,
      details,
      timezone,
      reminder_offsets_minutes,
      rescheduled_from_id
    ) values (
      v_user_id,
      'event',
      v_commitment.title,
      p_new_date,
      p_new_time,
      v_commitment.duration_minutes,
      'none',
      null,
      1,
      '{}'::smallint[],
      v_commitment.details,
      v_commitment.timezone,
      v_commitment.reminder_offsets_minutes,
      v_commitment.id
    ) returning id into v_replacement_id;
  elsif p_new_date is not null or p_new_time is not null then
    raise exception 'A new date and time only apply to rescheduled events';
  end if;

  if v_occurrence.id is null then
    insert into public.calendar_commitment_occurrences (
      user_id,
      calendar_commitment_id,
      occurrence_date,
      outcome,
      outcome_note,
      replacement_commitment_id,
      recorded_at,
      completed_at
    ) values (
      v_user_id,
      v_commitment.id,
      p_occurrence_date,
      p_outcome,
      v_outcome_note,
      v_replacement_id,
      v_now,
      v_completed_at
    );
  else
    insert into public.calendar_commitment_occurrence_revisions (
      user_id,
      calendar_commitment_occurrence_id,
      correction_type,
      reason,
      previous_outcome,
      previous_outcome_note,
      previous_completed_at,
      previous_recorded_at,
      new_outcome,
      new_outcome_note,
      new_completed_at,
      new_recorded_at
    ) values (
      v_user_id,
      v_occurrence.id,
      'record_after_correction',
      'User recorded a new outcome after correcting this occurrence.',
      v_occurrence.outcome,
      v_occurrence.outcome_note,
      v_occurrence.completed_at,
      v_occurrence.recorded_at,
      p_outcome,
      v_outcome_note,
      v_completed_at,
      v_now
    );

    update public.calendar_commitment_occurrences
    set
      outcome = p_outcome,
      outcome_note = v_outcome_note,
      replacement_commitment_id = v_replacement_id,
      recorded_at = v_now,
      completed_at = v_completed_at
    where id = v_occurrence.id;
  end if;

  update public.profiles set last_active_at = v_now
  where id = v_user_id;
  return v_replacement_id;
end;
$$;

create or replace function public.correct_calendar_event_occurrence_outcome(
  p_calendar_commitment_id uuid,
  p_occurrence_date date,
  p_new_outcome public.calendar_event_outcome default null,
  p_completed_time time without time zone default null,
  p_outcome_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_commitment public.calendar_commitments%rowtype;
  v_occurrence public.calendar_commitment_occurrences%rowtype;
  v_timezone text;
  v_now timestamptz := clock_timestamp();
  v_completed_at timestamptz;
  v_note text := nullif(btrim(p_outcome_note), '');
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_commitment
  from public.calendar_commitments
  where id = p_calendar_commitment_id and user_id = v_user_id
  for update;

  if v_commitment.id is null
    or v_commitment.commitment_type <> 'event'
  then
    raise exception 'Historical Calendar occurrence not found';
  end if;

  select timezone into v_timezone
  from public.profiles where id = v_user_id;
  if v_timezone is null then
    raise exception 'Profile timezone not found';
  end if;
  if p_occurrence_date >= (v_now at time zone v_timezone)::date then
    raise exception 'Only a past Calendar occurrence can be corrected here';
  end if;

  if not private.calendar_commitment_occurs_on_date(
    v_commitment.local_date,
    v_commitment.recurrence_unit,
    v_commitment.recurrence_interval,
    v_commitment.recurrence_weekdays,
    p_occurrence_date
  ) then
    raise exception 'Calendar event does not occur on this date';
  end if;
  if p_new_outcome = 'rescheduled' then
    raise exception 'Historical rescheduling requires a confirmed replacement commitment';
  end if;
  if p_outcome_note is not null and char_length(p_outcome_note) > 1000 then
    raise exception 'Outcome note is too long';
  end if;
  if p_new_outcome = 'attended' then
    if p_completed_time is not null then
      v_completed_at :=
        (p_occurrence_date + p_completed_time) at time zone v_timezone;
    end if;
  elsif p_completed_time is not null then
    raise exception 'Completion time applies only to a completed occurrence';
  end if;

  select * into v_occurrence
  from public.calendar_commitment_occurrences
  where calendar_commitment_id = v_commitment.id
    and user_id = v_user_id
    and occurrence_date = p_occurrence_date
  for update;

  if v_occurrence.id is null then
    insert into public.calendar_commitment_occurrences (
      user_id,
      calendar_commitment_id,
      occurrence_date,
      outcome,
      outcome_note,
      replacement_commitment_id,
      recorded_at,
      completed_at
    ) values (
      v_user_id,
      v_commitment.id,
      p_occurrence_date,
      null,
      null,
      null,
      v_now,
      null
    ) returning * into v_occurrence;
  end if;

  if v_occurrence.outcome is not distinct from p_new_outcome
    and v_occurrence.completed_at is not distinct from v_completed_at
    and v_occurrence.outcome_note is not distinct from v_note
  then
    raise exception 'That outcome is already recorded';
  end if;

  insert into public.calendar_commitment_occurrence_revisions (
    user_id,
    calendar_commitment_occurrence_id,
    correction_type,
    reason,
    previous_outcome,
    previous_outcome_note,
    previous_completed_at,
    previous_recorded_at,
    new_outcome,
    new_outcome_note,
    new_completed_at,
    new_recorded_at
  ) values (
    v_user_id,
    v_occurrence.id,
    'correct_outcome',
    'User corrected this occurrence outcome.',
    v_occurrence.outcome,
    v_occurrence.outcome_note,
    v_occurrence.completed_at,
    v_occurrence.recorded_at,
    p_new_outcome,
    v_note,
    v_completed_at,
    v_now
  );

  update public.calendar_commitment_occurrences
  set
    outcome = p_new_outcome,
    outcome_note = v_note,
    replacement_commitment_id = null,
    completed_at = v_completed_at,
    recorded_at = v_now
  where id = v_occurrence.id;

  update public.profiles set last_active_at = v_now
  where id = v_user_id;
  return v_occurrence.id;
end;
$$;

create or replace function public.get_calendar_commitments_for_date(
  p_local_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select coalesce(
    jsonb_agg(
      to_jsonb(commitment)
        || jsonb_build_object(
          'occurrence_date', p_local_date,
          'occurrence_id', occurrence.id,
          'status', case occurrence.outcome
            when 'attended' then 'completed'
            when 'missed' then 'missed'
            when 'cancelled' then 'cancelled'
            when 'rescheduled' then 'cancelled'
            else commitment.status::text
          end,
          'reconciliation_outcome', occurrence.outcome,
          'outcome_note', occurrence.outcome_note,
          'outcome_recorded_at', occurrence.recorded_at,
          'completed_at', occurrence.completed_at,
          'replacement_commitment_id', occurrence.replacement_commitment_id,
          'can_undo_completion', coalesce(
            occurrence.outcome = 'attended',
            false
          )
        )
      order by
        case commitment.commitment_type
          when 'event' then 0
          else 1
        end,
        coalesce(
          commitment.event_start_time,
          commitment.deadline_due_time,
          time '23:59:59'
        ),
        commitment.created_at,
        commitment.id
    ),
    '[]'::jsonb
  )
  into v_result
  from public.calendar_commitments as commitment
  left join public.calendar_commitment_occurrences as occurrence
    on occurrence.calendar_commitment_id = commitment.id
    and occurrence.user_id = v_user_id
    and occurrence.occurrence_date = p_local_date
  where commitment.user_id = v_user_id
    and (
      occurrence.id is not null
      or (
        commitment.status <> 'scheduled'
        and commitment.local_date = p_local_date
      )
      or (
        commitment.status = 'scheduled'
        and private.calendar_commitment_occurs_on_date(
          commitment.local_date,
          commitment.recurrence_unit,
          commitment.recurrence_interval,
          commitment.recurrence_weekdays,
          p_local_date
        )
      )
    );

  return v_result;
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
      commitment.recurrence_unit,
      commitment.recurrence_interval,
      commitment.recurrence_weekdays,
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
  select * into v_delivery
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

  select * into v_commitment
  from public.calendar_commitments
  where id = v_delivery.calendar_commitment_id
    and user_id = v_delivery.user_id
  for update;

  select * into v_subscription
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
      v_commitment.recurrence_unit,
      v_commitment.recurrence_interval,
      v_commitment.recurrence_weekdays,
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

drop function public.update_calendar_commitment(
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
  p_reminder_offsets_minutes integer[] default null,
  p_recurrence_unit public.calendar_recurrence_unit default null,
  p_recurrence_interval smallint default 1,
  p_recurrence_weekdays smallint[] default '{}'
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
  v_unit public.calendar_recurrence_unit := p_recurrence_unit;
  v_interval smallint := coalesce(p_recurrence_interval, 1);
  v_weekdays smallint[] := coalesce(p_recurrence_weekdays, '{}'::smallint[]);
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_existing
  from public.calendar_commitments
  where id = p_calendar_commitment_id and user_id = v_user_id
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

  if p_recurrence_unit is null and p_recurrence <> 'none' then
    v_unit := case p_recurrence
      when 'daily' then 'day'::public.calendar_recurrence_unit
      when 'weekly' then 'week'::public.calendar_recurrence_unit
      when 'fortnightly' then 'week'::public.calendar_recurrence_unit
      when 'monthly' then 'month'::public.calendar_recurrence_unit
      when 'yearly' then 'year'::public.calendar_recurrence_unit
      else null
    end;
    v_interval := case when p_recurrence = 'fortnightly' then 2 else 1 end;
    if v_unit = 'week' then
      v_weekdays := array[extract(isodow from p_local_date)::smallint];
    end if;
  end if;
  if not private.calendar_recurrence_rule_is_valid(
    p_recurrence, v_unit, v_interval, v_weekdays
  ) then
    raise exception 'Calendar recurrence rule is invalid';
  end if;

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

  if v_existing.recurrence_unit is null
    and v_unit is null
    and v_temporal_change
  then
    update public.calendar_commitments set status = 'cancelled'
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
      recurrence_unit,
      recurrence_interval,
      recurrence_weekdays,
      details,
      timezone,
      reminder_offsets_minutes,
      rescheduled_from_id
    ) values (
      v_user_id,
      p_commitment_type,
      btrim(p_title),
      p_local_date,
      p_event_start_time,
      p_deadline_due_time,
      p_duration_minutes,
      p_recurrence,
      v_unit,
      v_interval,
      v_weekdays,
      nullif(btrim(p_details), ''),
      v_existing.timezone,
      v_reminder_offsets,
      v_existing.id
    ) returning id into v_new_id;
    return v_new_id;
  end if;

  update public.calendar_commitments set
    commitment_type = p_commitment_type,
    title = btrim(p_title),
    local_date = p_local_date,
    event_start_time = p_event_start_time,
    deadline_due_time = p_deadline_due_time,
    duration_minutes = p_duration_minutes,
    recurrence = p_recurrence,
    recurrence_unit = v_unit,
    recurrence_interval = v_interval,
    recurrence_weekdays = v_weekdays,
    details = nullif(btrim(p_details), ''),
    reminder_offsets_minutes = v_reminder_offsets
  where id = v_existing.id;

  return v_existing.id;
end;
$$;

revoke all on function private.calendar_recurrence_rule_is_valid(
  public.calendar_recurrence_preset,
  public.calendar_recurrence_unit,
  smallint,
  smallint[]
) from public, anon, authenticated;
revoke all on function private.calendar_commitment_occurs_on_date(
  date,
  public.calendar_recurrence_unit,
  smallint,
  smallint[],
  date
) from public, anon, authenticated;

revoke all on function public.create_calendar_commitment(
  public.calendar_commitment_type,
  text,
  date,
  time without time zone,
  time without time zone,
  integer,
  public.calendar_recurrence_preset,
  text,
  integer[],
  public.calendar_recurrence_unit,
  smallint,
  smallint[]
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
  integer[],
  public.calendar_recurrence_unit,
  smallint,
  smallint[]
) from public, anon, authenticated;

grant execute on function public.create_calendar_commitment(
  public.calendar_commitment_type,
  text,
  date,
  time without time zone,
  time without time zone,
  integer,
  public.calendar_recurrence_preset,
  text,
  integer[],
  public.calendar_recurrence_unit,
  smallint,
  smallint[]
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
  integer[],
  public.calendar_recurrence_unit,
  smallint,
  smallint[]
) to authenticated;

revoke all on function public.get_calendar_commitments_for_date(date)
from public, anon, authenticated;
grant execute on function public.get_calendar_commitments_for_date(date)
to authenticated;

revoke all on function public.record_calendar_event_outcome(
  uuid,
  date,
  public.calendar_event_outcome,
  text,
  date,
  time without time zone
) from public, anon, authenticated;
grant execute on function public.record_calendar_event_outcome(
  uuid,
  date,
  public.calendar_event_outcome,
  text,
  date,
  time without time zone
) to authenticated;

revoke all on function public.correct_calendar_event_occurrence_outcome(
  uuid,
  date,
  public.calendar_event_outcome,
  time without time zone,
  text
) from public, anon, authenticated;
grant execute on function public.correct_calendar_event_occurrence_outcome(
  uuid,
  date,
  public.calendar_event_outcome,
  time without time zone,
  text
) to authenticated;

revoke all on function public.materialize_notification_deliveries(timestamptz)
from public, anon, authenticated;
revoke all on function public.revalidate_notification_delivery(uuid, timestamptz)
from public, anon, authenticated;
grant execute on function public.materialize_notification_deliveries(timestamptz)
to service_role;
grant execute on function public.revalidate_notification_delivery(uuid, timestamptz)
to service_role;

notify pgrst, 'reload schema';
