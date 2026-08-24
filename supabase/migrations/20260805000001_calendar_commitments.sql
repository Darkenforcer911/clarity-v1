create type public.calendar_commitment_type as enum (
  'event',
  'deadline'
);

create type public.calendar_commitment_status as enum (
  'scheduled',
  'completed',
  'missed',
  'cancelled'
);

create type public.calendar_recurrence_preset as enum (
  'none',
  'daily',
  'weekly',
  'fortnightly',
  'monthly'
);

create table public.calendar_commitments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  commitment_type public.calendar_commitment_type not null,
  title text not null,
  local_date date not null,
  event_start_time time without time zone,
  deadline_due_time time without time zone,
  duration_minutes integer,
  recurrence public.calendar_recurrence_preset not null default 'none',
  details text,
  status public.calendar_commitment_status not null default 'scheduled',
  timezone text not null,
  reminder_offsets_minutes integer[] not null default '{}',
  rescheduled_from_id uuid references public.calendar_commitments(id)
    on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_commitments_title_length check (
    char_length(btrim(title)) between 1 and 200
  ),
  constraint calendar_commitments_details_length check (
    details is null or char_length(details) <= 2000
  ),
  constraint calendar_commitments_timezone_length check (
    char_length(btrim(timezone)) between 1 and 100
  ),
  constraint calendar_commitments_duration check (
    duration_minutes is null or duration_minutes between 1 and 1440
  ),
  constraint calendar_commitments_type_fields check (
    (
      commitment_type = 'event'
      and event_start_time is not null
      and deadline_due_time is null
    )
    or (
      commitment_type = 'deadline'
      and event_start_time is null
      and duration_minutes is null
    )
  ),
  constraint calendar_commitments_reminder_capacity check (
    cardinality(reminder_offsets_minutes) <= 10
  )
);

create index calendar_commitments_user_date_idx
  on public.calendar_commitments (user_id, local_date);

create index calendar_commitments_user_status_date_idx
  on public.calendar_commitments (user_id, status, local_date);

create index calendar_commitments_recurring_idx
  on public.calendar_commitments (user_id, local_date, recurrence)
  where recurrence <> 'none' and status = 'scheduled';

create index calendar_commitments_rescheduled_from_idx
  on public.calendar_commitments (rescheduled_from_id)
  where rescheduled_from_id is not null;

create trigger calendar_commitments_set_updated_at
before update on public.calendar_commitments
for each row execute function public.set_updated_at();

alter table public.calendar_commitments enable row level security;
alter table public.calendar_commitments force row level security;

create policy "Users can read their own calendar commitments"
on public.calendar_commitments
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert their own calendar commitments"
on public.calendar_commitments
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own calendar commitments"
on public.calendar_commitments
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own calendar commitments"
on public.calendar_commitments
for delete
to authenticated
using ((select auth.uid()) = user_id);

revoke all on table public.calendar_commitments from anon, authenticated;
grant select on table public.calendar_commitments to authenticated;

create function private.validate_calendar_commitment_input(
  p_commitment_type public.calendar_commitment_type,
  p_title text,
  p_event_start_time time without time zone,
  p_deadline_due_time time without time zone,
  p_duration_minutes integer,
  p_details text
)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if nullif(btrim(p_title), '') is null
    or char_length(btrim(p_title)) > 200
  then
    raise exception 'Commitment title must be between 1 and 200 characters';
  end if;

  if p_details is not null and char_length(p_details) > 2000 then
    raise exception 'Commitment details are too long';
  end if;

  if p_commitment_type = 'event' then
    if p_event_start_time is null or p_deadline_due_time is not null then
      raise exception 'Events need a start time';
    end if;

    if p_duration_minutes is not null
      and p_duration_minutes not between 1 and 1440
    then
      raise exception 'Event duration must be within one day';
    end if;
  elsif p_event_start_time is not null or p_duration_minutes is not null then
    raise exception 'Deadlines cannot include event timing fields';
  end if;
end;
$$;

create function public.get_calendar_commitments_for_date(
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
        || jsonb_build_object('occurrence_date', p_local_date)
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
  where commitment.user_id = v_user_id
    and (
      (
        commitment.status <> 'scheduled'
        and commitment.local_date = p_local_date
      )
      or (
        commitment.status = 'scheduled'
        and commitment.local_date <= p_local_date
        and (
          (
            commitment.recurrence = 'none'
            and commitment.local_date = p_local_date
          )
          or commitment.recurrence = 'daily'
          or (
            commitment.recurrence = 'weekly'
            and (p_local_date - commitment.local_date) % 7 = 0
          )
          or (
            commitment.recurrence = 'fortnightly'
            and (p_local_date - commitment.local_date) % 14 = 0
          )
          or (
            commitment.recurrence = 'monthly'
            and extract(day from p_local_date)
              = extract(day from commitment.local_date)
          )
        )
      )
    );

  return v_result;
end;
$$;

create function public.create_calendar_commitment(
  p_commitment_type public.calendar_commitment_type,
  p_title text,
  p_local_date date,
  p_event_start_time time without time zone default null,
  p_deadline_due_time time without time zone default null,
  p_duration_minutes integer default null,
  p_recurrence public.calendar_recurrence_preset default 'none',
  p_details text default null
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
    timezone
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
    v_timezone
  )
  returning id into v_commitment_id;

  return v_commitment_id;
end;
$$;

create function public.update_calendar_commitment(
  p_calendar_commitment_id uuid,
  p_commitment_type public.calendar_commitment_type,
  p_title text,
  p_local_date date,
  p_event_start_time time without time zone default null,
  p_deadline_due_time time without time zone default null,
  p_duration_minutes integer default null,
  p_recurrence public.calendar_recurrence_preset default 'none',
  p_details text default null
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
    details = nullif(btrim(p_details), '')
  where id = v_existing.id;

  return v_existing.id;
end;
$$;

create function public.cancel_calendar_commitment(
  p_calendar_commitment_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_status public.calendar_commitment_status;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select status
  into v_status
  from public.calendar_commitments
  where id = p_calendar_commitment_id
    and user_id = v_user_id
  for update;

  if v_status is null then
    raise exception 'Calendar commitment not found';
  end if;

  if v_status = 'cancelled' then
    return;
  end if;

  if v_status <> 'scheduled' then
    raise exception 'Only a scheduled commitment can be cancelled';
  end if;

  update public.calendar_commitments
  set status = 'cancelled'
  where id = p_calendar_commitment_id
    and user_id = v_user_id;
end;
$$;

create function public.delete_calendar_commitment(
  p_calendar_commitment_id uuid
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

  delete from public.calendar_commitments
  where id = p_calendar_commitment_id
    and user_id = v_user_id;

  if not found then
    raise exception 'Calendar commitment not found';
  end if;
end;
$$;

revoke all on function private.validate_calendar_commitment_input(
  public.calendar_commitment_type,
  text,
  time without time zone,
  time without time zone,
  integer,
  text
) from public, anon, authenticated;

revoke all on function public.get_calendar_commitments_for_date(date)
from public, anon, authenticated;
revoke all on function public.create_calendar_commitment(
  public.calendar_commitment_type,
  text,
  date,
  time without time zone,
  time without time zone,
  integer,
  public.calendar_recurrence_preset,
  text
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
  text
) from public, anon, authenticated;
revoke all on function public.cancel_calendar_commitment(uuid)
from public, anon, authenticated;
revoke all on function public.delete_calendar_commitment(uuid)
from public, anon, authenticated;

grant execute on function public.get_calendar_commitments_for_date(date)
to authenticated;
grant execute on function public.create_calendar_commitment(
  public.calendar_commitment_type,
  text,
  date,
  time without time zone,
  time without time zone,
  integer,
  public.calendar_recurrence_preset,
  text
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
  text
) to authenticated;
grant execute on function public.cancel_calendar_commitment(uuid)
to authenticated;
grant execute on function public.delete_calendar_commitment(uuid)
to authenticated;

notify pgrst, 'reload schema';
