alter table public.daily_plans
  drop constraint daily_plans_proposed_fields;

alter table public.daily_plans
  add constraint daily_plans_proposed_fields check (
    record_kind <> 'planned'
    or status = 'unshaped'
    or (
      focus is not null
      and proposed_at is not null
    )
  );

create function public.save_context_only_proposed_plan(
  p_local_date date,
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
  v_placeholder_time timestamptz := clock_timestamp();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  v_plan_id := public.save_proposed_plan(
    p_local_date,
    v_placeholder_time,
    v_placeholder_time,
    p_context_for_today,
    p_focus,
    p_actions
  );

  update public.daily_plans
  set
    woke_at = null,
    aiming_to_sleep_at = null
  where id = v_plan_id
    and user_id = v_user_id;

  if not found then
    raise exception 'Daily plan not found';
  end if;

  return v_plan_id;
end;
$$;

revoke all on function public.save_context_only_proposed_plan(
  date,
  text,
  text,
  jsonb
) from public, anon, authenticated;

grant execute on function public.save_context_only_proposed_plan(
  date,
  text,
  text,
  jsonb
) to authenticated;
