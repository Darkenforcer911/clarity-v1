alter table public.profiles
  add column date_of_birth date,
  add column city text,
  add column country text,
  add constraint profiles_city_length check (
    city is null or char_length(btrim(city)) between 1 and 120
  ),
  add constraint profiles_country_length check (
    country is null or char_length(btrim(country)) between 1 and 120
  );

-- Existing accounts predate the usable onboarding experience. Keep their
-- current product access intact; they can use the development-only preview
-- without altering this flag or their canonical Life Model.
update public.profiles
set onboarding_completed = true
where onboarding_completed = false;

create function public.save_onboarding_identity_step_v1(
  p_name text,
  p_date_of_birth date,
  p_city text,
  p_country text,
  p_timezone text,
  p_onboarding_version integer,
  p_user_draft jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id uuid;
  v_local_today date;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if nullif(btrim(p_name), '') is null
    or char_length(btrim(p_name)) > 200 then
    raise exception 'Name must be between 1 and 200 characters';
  end if;

  if not public.is_valid_timezone(p_timezone) then
    raise exception 'Invalid timezone';
  end if;

  v_local_today := (clock_timestamp() at time zone p_timezone)::date;
  if p_date_of_birth is null or p_date_of_birth > v_local_today then
    raise exception 'Choose a valid date of birth';
  end if;

  if nullif(btrim(p_city), '') is null
    or char_length(btrim(p_city)) > 120 then
    raise exception 'City must be between 1 and 120 characters';
  end if;

  if nullif(btrim(p_country), '') is null
    or char_length(btrim(p_country)) > 120 then
    raise exception 'Country must be between 1 and 120 characters';
  end if;

  if p_onboarding_version < 1 then
    raise exception 'Onboarding version must be positive';
  end if;

  if jsonb_typeof(p_user_draft) <> 'object' then
    raise exception 'Onboarding user draft must be an object';
  end if;

  update public.profiles
  set
    name = btrim(p_name),
    date_of_birth = p_date_of_birth,
    city = btrim(p_city),
    country = btrim(p_country),
    timezone = p_timezone,
    last_active_at = clock_timestamp()
  where id = v_user_id;

  if not found then
    raise exception 'Profile not found';
  end if;

  select id
  into v_session_id
  from public.onboarding_sessions
  where user_id = v_user_id
    and status = 'in_progress'
  for update;

  if found then
    update public.onboarding_sessions
    set
      onboarding_version = p_onboarding_version,
      current_step = 'current_reality',
      user_draft = p_user_draft
    where id = v_session_id
      and user_id = v_user_id;
  else
    insert into public.onboarding_sessions (
      user_id,
      onboarding_version,
      current_step,
      user_draft
    )
    values (
      v_user_id,
      p_onboarding_version,
      'current_reality',
      p_user_draft
    )
    returning id into v_session_id;
  end if;

  return v_session_id;
end;
$$;

-- Device timezone remains useful telemetry, but the user's confirmed planning
-- timezone is authoritative and must not silently change when the app opens.
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
  set last_active_at = now()
  where id = v_user_id;

  if not found then
    raise exception 'Profile not found';
  end if;

  insert into public.product_events (user_id, event_name, properties)
  values (
    v_user_id,
    'app_opened',
    jsonb_build_object('observedDeviceTimezone', p_timezone)
  );
end;
$$;

revoke all on function public.save_onboarding_identity_step_v1(
  text,
  date,
  text,
  text,
  text,
  integer,
  jsonb
) from public, anon, authenticated;
grant execute on function public.save_onboarding_identity_step_v1(
  text,
  date,
  text,
  text,
  text,
  integer,
  jsonb
) to authenticated;

revoke all on function public.record_app_opened(text) from public, anon;
grant execute on function public.record_app_opened(text) to authenticated;

notify pgrst, 'reload schema';
