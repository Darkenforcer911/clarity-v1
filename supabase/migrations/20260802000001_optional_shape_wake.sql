alter table public.daily_plans
  drop constraint daily_plans_proposed_fields;

alter table public.daily_plans
  add constraint daily_plans_proposed_fields check (
    record_kind <> 'planned'
    or status = 'unshaped'
    or (
      aiming_to_sleep_at is not null
      and focus is not null
      and proposed_at is not null
    )
  );

create function public.save_proposed_plan_with_optional_wake(
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
  v_plan_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  v_plan_id := public.save_proposed_plan(
    p_local_date,
    coalesce(p_woke_at, clock_timestamp()),
    p_aiming_to_sleep_at,
    p_context_for_today,
    p_focus,
    p_actions
  );

  if p_woke_at is null then
    update public.daily_plans
    set woke_at = null
    where id = v_plan_id
      and user_id = v_user_id;
  end if;

  return v_plan_id;
end;
$$;

revoke all on function public.save_proposed_plan_with_optional_wake(
  date,
  timestamptz,
  timestamptz,
  text,
  text,
  jsonb
) from public, anon, authenticated;

grant execute on function public.save_proposed_plan_with_optional_wake(
  date,
  timestamptz,
  timestamptz,
  text,
  text,
  jsonb
) to authenticated;
