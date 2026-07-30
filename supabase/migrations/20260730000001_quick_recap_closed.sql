create function public.reconcile_previous_day_direct_v2(
  p_daily_plan_id uuid,
  p_resolutions jsonb,
  p_extra_context text default null,
  p_unplanned_progress jsonb default '[]'::jsonb,
  p_context_summary text default null,
  p_ongoing_context_candidate jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_record_id uuid;
  v_transformed_resolutions jsonb;
  v_progress jsonb;
  v_updated_action_progress jsonb := '[]'::jsonb;
  v_updated_unfinished_actions jsonb := '[]'::jsonb;
  v_snapshot_item jsonb;
  v_resolution jsonb;
  v_close_reason text;
  v_close_context text;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_resolutions is null
    or jsonb_typeof(p_resolutions) <> 'array'
  then
    raise exception 'Previous-day resolutions must be an array';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_resolutions) as resolution(value)
    where (
      value ->> 'outcome' = 'not_done'
      and (
        nullif(btrim(value ->> 'notDoneNote'), '') is null
        or char_length(coalesce(value ->> 'notDoneNote', '')) > 500
      )
    )
    or (
      value ->> 'outcome' = 'closed'
      and (
        nullif(value ->> 'closeReason', '') is null
        or value ->> 'closeReason' <> 'removed_from_plan'
        or nullif(btrim(value ->> 'closeContext'), '') is null
        or char_length(coalesce(value ->> 'closeContext', '')) > 500
      )
    )
    or (
      value ->> 'outcome' <> 'closed'
      and (
        nullif(value ->> 'closeReason', '') is not null
        or nullif(value ->> 'closeContext', '') is not null
      )
    )
  ) then
    raise exception 'Every Closed resolution must be valid';
  end if;

  select coalesce(
    jsonb_agg(
      case
        when resolution.value ->> 'outcome' = 'closed'
        then
          (
            resolution.value
            - 'closeReason'
            - 'closeContext'
          )
          || jsonb_build_object(
            'outcome',
            'resolved_elsewhere',
            'resolvedElsewhereNote',
            nullif(btrim(resolution.value ->> 'closeContext'), '')
          )
        else resolution.value
      end
    ),
    '[]'::jsonb
  )
  into v_transformed_resolutions
  from jsonb_array_elements(p_resolutions) as resolution(value);

  v_record_id := public.reconcile_previous_day_direct(
    p_daily_plan_id,
    v_transformed_resolutions,
    p_extra_context,
    p_unplanned_progress,
    p_context_summary,
    p_ongoing_context_candidate
  );

  update public.daily_actions as action
  set
    status = 'dropped',
    completed_at = null,
    completion_recorded_at = null,
    completion_time_unknown = false,
    rescheduled_for = null,
    resolution_note = 'Removed from plan during recap'
  where action.daily_plan_id = p_daily_plan_id
    and action.user_id = v_user_id
    and exists (
      select 1
      from jsonb_array_elements(p_resolutions) as resolution(value)
      where resolution.value ->> 'outcome' = 'closed'
        and resolution.value ->> 'actionId' = action.id::text
    );

  select record.progress_recorded
  into v_progress
  from public.day_records as record
  where record.id = v_record_id
    and record.user_id = v_user_id
    and record.daily_plan_id = p_daily_plan_id
  for update;

  if v_progress is null then
    raise exception 'Reconciled Day Record not found';
  end if;

  for v_snapshot_item in
    select value
    from jsonb_array_elements(
      coalesce(v_progress -> 'actionProgress', '[]'::jsonb)
    )
  loop
    v_resolution := null;

    select resolution.value
    into v_resolution
    from jsonb_array_elements(p_resolutions) as resolution(value)
    where resolution.value ->> 'actionId'
      = v_snapshot_item ->> 'actionId'
    limit 1;

    if v_resolution ->> 'outcome' = 'closed' then
      v_close_reason := v_resolution ->> 'closeReason';
      v_close_context :=
        nullif(btrim(v_resolution ->> 'closeContext'), '');
      v_snapshot_item :=
        (
          v_snapshot_item
          - 'resolvedElsewhereNote'
          - 'notDoneNote'
          - 'progressDescription'
        )
        || jsonb_build_object(
          'outcome', 'closed',
          'closeReason', v_close_reason,
          'closeContext', v_close_context,
          'note', v_close_context
        );
    elsif v_resolution ->> 'outcome' = 'not_done' then
      v_snapshot_item :=
        v_snapshot_item || jsonb_build_object(
          'note', v_resolution ->> 'notDoneNote',
          'notDoneNote', v_resolution ->> 'notDoneNote'
        );
    end if;

    v_updated_action_progress :=
      v_updated_action_progress || jsonb_build_array(v_snapshot_item);
  end loop;

  for v_snapshot_item in
    select value
    from jsonb_array_elements(
      coalesce(v_progress -> 'unfinishedActions', '[]'::jsonb)
    )
  loop
    v_resolution := null;

    select resolution.value
    into v_resolution
    from jsonb_array_elements(p_resolutions) as resolution(value)
    where resolution.value ->> 'actionId'
      = v_snapshot_item ->> 'id'
    limit 1;

    if v_resolution ->> 'outcome' = 'closed' then
      v_close_reason := v_resolution ->> 'closeReason';
      v_close_context :=
        nullif(btrim(v_resolution ->> 'closeContext'), '');
      v_snapshot_item :=
        (
          v_snapshot_item
          - 'resolvedElsewhereNote'
          - 'notDoneNote'
          - 'progressNote'
        )
        || jsonb_build_object(
          'outcome', 'closed',
          'closeReason', v_close_reason,
          'closeContext', v_close_context
        );
    elsif v_resolution ->> 'outcome' = 'not_done' then
      v_snapshot_item :=
        v_snapshot_item || jsonb_build_object(
          'notDoneNote', v_resolution ->> 'notDoneNote'
        );
    end if;

    v_updated_unfinished_actions :=
      v_updated_unfinished_actions || jsonb_build_array(v_snapshot_item);
  end loop;

  update public.day_records
  set progress_recorded =
    v_progress || jsonb_build_object(
      'actionProgress', v_updated_action_progress,
      'unfinishedActions', v_updated_unfinished_actions
    )
  where id = v_record_id
    and user_id = v_user_id
    and daily_plan_id = p_daily_plan_id;

  return v_record_id;
end;
$$;

revoke all on function public.reconcile_previous_day_direct_v2(
  uuid,
  jsonb,
  text,
  jsonb,
  text,
  jsonb
)
  from public, anon;

grant execute on function public.reconcile_previous_day_direct_v2(
  uuid,
  jsonb,
  text,
  jsonb,
  text,
  jsonb
)
  to authenticated;
