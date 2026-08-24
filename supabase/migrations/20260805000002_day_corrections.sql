create type public.day_correction_type as enum (
  'completed_item',
  'historical_event',
  'day_note'
);

create table public.day_corrections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  local_date date not null,
  correction_type public.day_correction_type not null,
  title text,
  occurred_time time without time zone,
  duration_minutes integer,
  details text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint day_corrections_title_length check (
    title is null or char_length(btrim(title)) between 1 and 200
  ),
  constraint day_corrections_details_length check (
    details is null or char_length(btrim(details)) between 1 and 2000
  ),
  constraint day_corrections_duration check (
    duration_minutes is null or duration_minutes between 1 and 1440
  ),
  constraint day_corrections_type_fields check (
    (
      correction_type = 'completed_item'
      and title is not null
      and duration_minutes is null
      and details is null
    )
    or (
      correction_type = 'historical_event'
      and title is not null
    )
    or (
      correction_type = 'day_note'
      and title is null
      and occurred_time is null
      and duration_minutes is null
      and details is not null
    )
  )
);

create index day_corrections_user_date_idx
  on public.day_corrections (user_id, local_date, created_at);

create trigger day_corrections_set_updated_at
before update on public.day_corrections
for each row execute function public.set_updated_at();

alter table public.day_corrections enable row level security;
alter table public.day_corrections force row level security;

create policy "Users can read their own day corrections"
on public.day_corrections
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert their own day corrections"
on public.day_corrections
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own day corrections"
on public.day_corrections
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own day corrections"
on public.day_corrections
for delete
to authenticated
using ((select auth.uid()) = user_id);

revoke all on table public.day_corrections from anon, authenticated;
grant select on table public.day_corrections to authenticated;

create function private.validate_day_correction_input(
  p_correction_type public.day_correction_type,
  p_title text,
  p_occurred_time time without time zone,
  p_duration_minutes integer,
  p_details text
)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_correction_type in ('completed_item', 'historical_event') then
    if nullif(btrim(p_title), '') is null
      or char_length(btrim(p_title)) > 200
    then
      raise exception 'Correction title must be between 1 and 200 characters';
    end if;
  elsif p_correction_type = 'day_note' then
    if nullif(btrim(p_details), '') is null
      or char_length(btrim(p_details)) > 2000
    then
      raise exception 'Day note must be between 1 and 2000 characters';
    end if;
  end if;

  if p_details is not null and char_length(btrim(p_details)) > 2000 then
    raise exception 'Correction details are too long';
  end if;

  if p_duration_minutes is not null
    and p_duration_minutes not between 1 and 1440
  then
    raise exception 'Correction duration must be within one day';
  end if;

  if p_correction_type = 'completed_item'
    and (p_duration_minutes is not null or p_details is not null)
  then
    raise exception 'Completed-item corrections do not accept event details';
  end if;

  if p_correction_type = 'day_note'
    and (
      p_title is not null
      or p_occurred_time is not null
      or p_duration_minutes is not null
    )
  then
    raise exception 'Day-note corrections accept only the note';
  end if;
end;
$$;

create function public.get_day_corrections_for_date(p_local_date date)
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
    jsonb_agg(to_jsonb(correction) order by
      correction.occurred_time nulls last,
      correction.created_at,
      correction.id
    ),
    '[]'::jsonb
  ) into v_result
  from public.day_corrections as correction
  where correction.user_id = v_user_id
    and correction.local_date = p_local_date;

  return v_result;
end;
$$;

create function public.create_day_correction(
  p_local_date date,
  p_correction_type public.day_correction_type,
  p_title text default null,
  p_occurred_time time without time zone default null,
  p_duration_minutes integer default null,
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
  v_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select timezone into v_timezone
  from public.profiles
  where id = v_user_id;

  if v_timezone is null then
    raise exception 'Profile timezone not found';
  end if;

  if p_local_date >= timezone(v_timezone, now())::date then
    raise exception 'Corrections can only be added to a past date';
  end if;

  perform private.validate_day_correction_input(
    p_correction_type,
    p_title,
    p_occurred_time,
    p_duration_minutes,
    p_details
  );

  insert into public.day_corrections (
    user_id,
    local_date,
    correction_type,
    title,
    occurred_time,
    duration_minutes,
    details
  ) values (
    v_user_id,
    p_local_date,
    p_correction_type,
    nullif(btrim(p_title), ''),
    p_occurred_time,
    p_duration_minutes,
    nullif(btrim(p_details), '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

create function public.update_day_correction(
  p_day_correction_id uuid,
  p_correction_type public.day_correction_type,
  p_title text default null,
  p_occurred_time time without time zone default null,
  p_duration_minutes integer default null,
  p_details text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select id into v_existing_id
  from public.day_corrections
  where id = p_day_correction_id
    and user_id = v_user_id
  for update;

  if v_existing_id is null then
    raise exception 'Day correction not found';
  end if;

  perform private.validate_day_correction_input(
    p_correction_type,
    p_title,
    p_occurred_time,
    p_duration_minutes,
    p_details
  );

  update public.day_corrections
  set
    correction_type = p_correction_type,
    title = nullif(btrim(p_title), ''),
    occurred_time = p_occurred_time,
    duration_minutes = p_duration_minutes,
    details = nullif(btrim(p_details), '')
  where id = v_existing_id;
end;
$$;

create function public.delete_day_correction(p_day_correction_id uuid)
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

  delete from public.day_corrections
  where id = p_day_correction_id
    and user_id = v_user_id;

  if not found then
    raise exception 'Day correction not found';
  end if;
end;
$$;

revoke all on function private.validate_day_correction_input(
  public.day_correction_type,
  text,
  time without time zone,
  integer,
  text
) from public, anon, authenticated;
revoke all on function public.get_day_corrections_for_date(date)
from public, anon, authenticated;
revoke all on function public.create_day_correction(
  date,
  public.day_correction_type,
  text,
  time without time zone,
  integer,
  text
) from public, anon, authenticated;
revoke all on function public.update_day_correction(
  uuid,
  public.day_correction_type,
  text,
  time without time zone,
  integer,
  text
) from public, anon, authenticated;
revoke all on function public.delete_day_correction(uuid)
from public, anon, authenticated;

grant execute on function public.get_day_corrections_for_date(date)
to authenticated;
grant execute on function public.create_day_correction(
  date,
  public.day_correction_type,
  text,
  time without time zone,
  integer,
  text
) to authenticated;
grant execute on function public.update_day_correction(
  uuid,
  public.day_correction_type,
  text,
  time without time zone,
  integer,
  text
) to authenticated;
grant execute on function public.delete_day_correction(uuid)
to authenticated;

notify pgrst, 'reload schema';
