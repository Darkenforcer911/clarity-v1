-- Extend recurrence reconciliation to the deterministic occurrence shape
-- produced by 20260901000001, before the universal Action convergence changed
-- the generated explanatory copy. No title-only or legacy metadata inference is
-- used: rows must still belong to the same Routine and match its generated data.

alter function private.reconcile_action_recurrence_v1(
  uuid, uuid, text, smallint[]
) rename to reconcile_action_recurrence_v1_20260906;

revoke all on function private.reconcile_action_recurrence_v1_20260906(
  uuid, uuid, text, smallint[]
) from public, anon, authenticated;

create or replace function private.reconcile_action_recurrence_v1(
  p_user_id uuid,
  p_daily_action_id uuid,
  p_recurrence_pattern text,
  p_recurrence_days smallint[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action public.daily_actions%rowtype;
  v_routine public.routines%rowtype;
  v_timezone text;
begin
  if p_user_id is null or p_user_id is distinct from auth.uid() then
    raise exception 'Authentication required';
  end if;

  select action.* into v_action
  from public.daily_actions as action
  where action.id = p_daily_action_id
    and action.user_id = p_user_id
  for update;

  if v_action.id is null then
    raise exception 'Action not found';
  end if;

  select profile.timezone into v_timezone
  from public.profiles as profile
  where profile.id = p_user_id;

  if v_timezone is null then
    raise exception 'Profile timezone not found';
  end if;

  if v_action.source_routine_id is not null then
    select routine.* into v_routine
    from public.routines as routine
    where routine.id = v_action.source_routine_id
      and routine.user_id = p_user_id
    for update;

    if v_routine.id is null then
      raise exception 'Repeating Action definition not found';
    end if;

    delete from public.daily_actions as future_action
    where future_action.user_id = p_user_id
      and future_action.source_routine_id = v_routine.id
      and future_action.local_date > v_action.local_date
      and future_action.status = 'proposed'
      and future_action.approved_at is null
      and not future_action.completion_evidence_only
      and future_action.completed_at is null
      and future_action.completion_recorded_at is null
      and future_action.rescheduled_for is null
      and future_action.resolution_note is null
      and future_action.title = v_routine.title
      and future_action.action_type = case
        when v_routine.preferred_time is null then 'flexible'
        else 'fixed'
      end
      and future_action.estimated_minutes = v_routine.estimated_minutes
      and future_action.scheduled_time is not distinct from case
        when v_routine.preferred_time is null then null
        else (future_action.local_date + v_routine.preferred_time)
          at time zone v_timezone
      end
      and future_action.due_local_date is null
      and future_action.due_local_time is null
      and cardinality(future_action.reminder_offsets_minutes) = 0
      and future_action.details is null
      and future_action.why_it_exists = 'This routine applies today.'
      and future_action.definition_of_done = v_routine.title || ' is complete.'
      and future_action.suggested_method = 'Complete the routine as planned.'
      and future_action.original_input = v_routine.title
      and future_action.recurrence_pattern = 'none'
      and cardinality(future_action.recurrence_days) = 0
      and future_action.life_area_id is not distinct from v_routine.life_area_id
      and future_action.goal_id is not distinct from v_routine.goal_id
      and future_action.project_id is not distinct from v_routine.project_id
      and future_action.relationship_source is not distinct from v_routine.created_via;
  end if;

  perform private.reconcile_action_recurrence_v1_20260906(
    p_user_id,
    p_daily_action_id,
    p_recurrence_pattern,
    p_recurrence_days
  );
end;
$$;

revoke all on function private.reconcile_action_recurrence_v1(
  uuid, uuid, text, smallint[]
) from public, anon, authenticated;

-- Repair already-ended series whose earlier client path transitioned the
-- Routine without invoking occurrence reconciliation. Only later rows that
-- still retain one of the two exact deterministic fingerprints qualify.
delete from public.daily_actions as future_action
using public.routines as routine, public.profiles as profile
where routine.id = future_action.source_routine_id
  and routine.user_id = future_action.user_id
  and profile.id = routine.user_id
  and routine.status = 'ended'
  and routine.ended_at is not null
  and future_action.local_date >
    (routine.ended_at at time zone profile.timezone)::date
  and future_action.status = 'proposed'
  and future_action.approved_at is null
  and not future_action.completion_evidence_only
  and future_action.completed_at is null
  and future_action.completion_recorded_at is null
  and future_action.rescheduled_for is null
  and future_action.resolution_note is null
  and future_action.title = routine.title
  and future_action.action_type = case
    when routine.preferred_time is null then 'flexible'
    else 'fixed'
  end
  and future_action.estimated_minutes = routine.estimated_minutes
  and future_action.scheduled_time is not distinct from case
    when routine.preferred_time is null then null
    else (future_action.local_date + routine.preferred_time)
      at time zone profile.timezone
  end
  and future_action.original_input = routine.title
  and future_action.recurrence_pattern = 'none'
  and cardinality(future_action.recurrence_days) = 0
  and future_action.life_area_id is not distinct from routine.life_area_id
  and future_action.goal_id is not distinct from routine.goal_id
  and future_action.project_id is not distinct from routine.project_id
  and future_action.relationship_source is not distinct from routine.created_via
  and (
    (
      future_action.due_local_date is null
      and future_action.due_local_time is null
      and cardinality(future_action.reminder_offsets_minutes) = 0
      and future_action.details is null
      and future_action.why_it_exists = 'This routine applies today.'
      and future_action.definition_of_done = routine.title || ' is complete.'
      and future_action.suggested_method = 'Complete the routine as planned.'
    )
    or (
      future_action.due_local_date is not distinct from case
        when routine.due_offset_days is null then null
        else future_action.local_date + routine.due_offset_days
      end
      and future_action.due_local_time is not distinct from routine.due_local_time
      and future_action.reminder_offsets_minutes = routine.reminder_offsets_minutes
      and future_action.details is not distinct from routine.details
      and future_action.why_it_exists = 'This repeating action applies on this date.'
      and future_action.definition_of_done = routine.title || ' is complete.'
      and future_action.suggested_method = 'Complete the action as planned.'
    )
  );

notify pgrst, 'reload schema';
