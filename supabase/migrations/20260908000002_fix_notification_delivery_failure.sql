-- The Action convergence replacement kept target-aware retry scheduling but
-- referenced a disabled_at column that never existed. Preserve the original
-- subscription failure accounting while retaining Action and Calendar support.
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
  v_action public.daily_actions%rowtype;
  v_timezone text;
  v_useful_until timestamptz;
  v_final_status public.notification_delivery_status;
begin
  if nullif(btrim(p_error_code), '') is null
    or char_length(p_error_code) > 200
  then
    raise exception 'A safe delivery error code is required';
  end if;

  select delivery.* into v_delivery
  from public.notification_deliveries as delivery
  where delivery.id = p_delivery_id
  for update;

  if v_delivery.id is null or v_delivery.status <> 'processing' then
    return null;
  end if;

  if v_delivery.calendar_commitment_id is not null then
    select commitment.* into v_commitment
    from public.calendar_commitments as commitment
    where commitment.id = v_delivery.calendar_commitment_id;

    if v_commitment.id is not null then
      select schedule.useful_until into v_useful_until
      from private.notification_delivery_schedule(
        v_commitment.commitment_type,
        v_delivery.occurrence_date,
        v_commitment.event_start_time,
        v_commitment.deadline_due_time,
        v_commitment.timezone,
        v_delivery.reminder_offset_minutes
      ) as schedule;
    end if;
  else
    select action.* into v_action
    from public.daily_actions as action
    where action.id = v_delivery.daily_action_id
      and action.user_id = v_delivery.user_id;

    select profile.timezone into v_timezone
    from public.profiles as profile
    where profile.id = v_delivery.user_id;

    if v_action.id is not null and v_timezone is not null then
      select schedule.useful_until into v_useful_until
      from private.action_notification_delivery_schedule(
        v_action.scheduled_time,
        v_action.due_local_date,
        v_action.due_local_time,
        v_timezone,
        v_delivery.reminder_offset_minutes
      ) as schedule;
    end if;
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
  where id = v_delivery.push_subscription_id
    and user_id = v_delivery.user_id;

  return v_final_status;
end;
$$;

revoke all on function public.record_notification_delivery_failure(
  uuid,
  text,
  boolean,
  timestamptz,
  timestamptz
) from public, anon, authenticated;

grant execute on function public.record_notification_delivery_failure(
  uuid,
  text,
  boolean,
  timestamptz,
  timestamptz
) to service_role;

notify pgrst, 'reload schema';
