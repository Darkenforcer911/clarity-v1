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
      where reminder_offset < 0
        or reminder_offset > 43200
        or (
          p_day_level_only
          and (
            reminder_offset = 0
            or reminder_offset % 1440 <> 0
          )
        )
    );
$$;

alter table public.notification_deliveries
  drop constraint notification_deliveries_offset_valid,
  add constraint notification_deliveries_offset_valid check (
    reminder_offset_minutes between 0 and 43200
  );

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
  if p_reminder_offset_minutes < 0 then
    raise exception 'Reminder offset must be non-negative';
  end if;

  if p_commitment_type = 'deadline' and p_deadline_due_time is null then
    if p_reminder_offset_minutes = 0
      or p_reminder_offset_minutes % 1440 <> 0
    then
      raise exception 'Date-only deadline reminders must use positive whole days';
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
  useful_until := case
    when p_reminder_offset_minutes = 0
      then scheduled_for + interval '10 minutes'
    else least(scheduled_for + interval '2 hours', v_actual_at)
  end;
  return next;
end;
$$;

create or replace function public.create_calendar_commitment(
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
      case when p_commitment_type = 'event' then array[0] else array[1440] end
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

revoke all on function private.calendar_reminder_offsets_are_valid(
  integer[],
  boolean
) from public, anon, authenticated;
revoke all on function private.notification_delivery_schedule(
  public.calendar_commitment_type,
  date,
  time without time zone,
  time without time zone,
  text,
  integer
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

notify pgrst, 'reload schema';
