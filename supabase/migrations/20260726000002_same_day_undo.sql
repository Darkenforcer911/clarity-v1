alter table public.product_events
drop constraint product_events_known_name;

alter table public.product_events
add constraint product_events_known_name check (
  event_name in (
    'app_opened',
    'day_shaping_started',
    'plan_generated',
    'plan_approved',
    'action_completed',
    'day_closing_started',
    'day_closed',
    'day_close_undone'
  )
);

create or replace function public.undo_day_close(p_daily_plan_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan public.daily_plans%rowtype;
  v_timezone text;
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

  if v_plan.status <> 'closed' then
    raise exception 'Only a closed plan can be undone';
  end if;

  select timezone
  into v_timezone
  from public.profiles
  where id = v_user_id;

  if v_plan.local_date <> (now() at time zone v_timezone)::date then
    raise exception 'A day can only be undone on the same local date';
  end if;

  perform 1
  from public.daily_actions
  where daily_plan_id = v_plan.id
    and user_id = v_user_id
  for update;

  delete from public.day_records
  where daily_plan_id = v_plan.id
    and user_id = v_user_id;

  update public.daily_actions
  set
    status = 'active',
    rescheduled_for = null,
    resolution_note = null
  where daily_plan_id = v_plan.id
    and user_id = v_user_id
    and status in ('rescheduled', 'dropped');

  update public.daily_plans
  set
    status = 'active',
    closed_at = null
  where id = v_plan.id;

  perform private.touch_profile_and_record_event(
    v_user_id,
    'day_close_undone',
    jsonb_build_object('dailyPlanId', v_plan.id)
  );
end;
$$;

revoke all on function public.undo_day_close(uuid) from public, anon;
grant execute on function public.undo_day_close(uuid) to authenticated;
