create function public.rename_life_area(
  p_life_area_id uuid,
  p_name text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_status public.life_area_status;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select status
  into v_status
  from public.life_areas
  where id = p_life_area_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Life Area not found';
  end if;

  if v_status <> 'active' then
    raise exception 'Archived Life Areas cannot be changed';
  end if;

  update public.life_areas
  set name = btrim(p_name)
  where id = p_life_area_id
    and user_id = v_user_id;
end;
$$;

create function public.reorder_life_areas(
  p_ordered_life_area_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_active_count integer;
  v_input_count integer;
  v_distinct_count integer;
  v_owned_count integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_ordered_life_area_ids is null then
    raise exception 'Life Area order is required';
  end if;

  if array_position(p_ordered_life_area_ids, null) is not null then
    raise exception 'Life Area order cannot contain null IDs';
  end if;

  v_input_count := cardinality(p_ordered_life_area_ids);

  select count(distinct area_id)
  into v_distinct_count
  from unnest(p_ordered_life_area_ids) as ordered(area_id);

  if v_distinct_count <> v_input_count then
    raise exception 'Life Area order cannot contain duplicate IDs';
  end if;

  perform 1
  from public.life_areas
  where user_id = v_user_id
    and status = 'active'
  order by id
  for update;

  select count(*)
  into v_active_count
  from public.life_areas
  where user_id = v_user_id
    and status = 'active';

  select count(*)
  into v_owned_count
  from public.life_areas
  where user_id = v_user_id
    and status = 'active'
    and id = any(p_ordered_life_area_ids);

  if v_input_count <> v_active_count or v_owned_count <> v_active_count then
    raise exception 'Life Area order must contain every active owned Life Area exactly once';
  end if;

  update public.life_areas as area
  set sort_order = (ordered.ordinality - 1)::integer
  from unnest(p_ordered_life_area_ids) with ordinality as ordered(id, ordinality)
  where area.id = ordered.id
    and area.user_id = v_user_id
    and area.status = 'active';
end;
$$;

create function public.archive_life_area(
  p_life_area_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_status public.life_area_status;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select status
  into v_status
  from public.life_areas
  where id = p_life_area_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Life Area not found';
  end if;

  if v_status <> 'active' then
    raise exception 'Life Area is already archived';
  end if;

  if exists (
    select 1
    from public.goals
    where user_id = v_user_id
      and life_area_id = p_life_area_id
      and status in ('exploring', 'active')
      and archived_at is null
  ) then
    raise exception 'Retire or move active Goals before archiving this Life Area';
  end if;

  if exists (
    select 1
    from public.projects
    where user_id = v_user_id
      and life_area_id = p_life_area_id
      and status in ('planned', 'active', 'paused')
      and archived_at is null
  ) then
    raise exception 'Retire or move active Projects before archiving this Life Area';
  end if;

  if exists (
    select 1
    from public.routines
    where user_id = v_user_id
      and life_area_id = p_life_area_id
      and status in ('active', 'paused')
  ) then
    raise exception 'End active Routines before archiving this Life Area';
  end if;

  if exists (
    select 1
    from public.current_contexts
    where user_id = v_user_id
      and life_area_id = p_life_area_id
      and status = 'active'
  ) then
    raise exception 'End active Current Contexts before archiving this Life Area';
  end if;

  update public.life_areas
  set
    status = 'archived',
    archived_at = clock_timestamp()
  where id = p_life_area_id
    and user_id = v_user_id;
end;
$$;

create function public.update_goal(
  p_goal_id uuid,
  p_title text,
  p_desired_outcome text,
  p_target_start_date date default null,
  p_target_end_date date default null,
  p_target_confidence public.life_target_confidence default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_status public.goal_status;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select status
  into v_status
  from public.goals
  where id = p_goal_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Goal not found';
  end if;

  if v_status not in ('exploring', 'active') then
    raise exception 'Terminal Goals cannot be changed';
  end if;

  update public.goals
  set
    title = btrim(p_title),
    desired_outcome = btrim(p_desired_outcome),
    target_start_date = p_target_start_date,
    target_end_date = p_target_end_date,
    target_confidence = p_target_confidence
  where id = p_goal_id
    and user_id = v_user_id;
end;
$$;

create function public.transition_goal_status(
  p_goal_id uuid,
  p_new_status public.goal_status,
  p_rationale text default null,
  p_evidence_summary text default null,
  p_consequence_summary text default null,
  p_replacement_goal_id uuid default null,
  p_created_via public.life_model_provenance default 'user_stated',
  p_source_proposal_id uuid default null,
  p_decided_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_goal public.goals%rowtype;
  v_decision_type public.goal_decision_type;
  v_decision_id uuid;
  v_rationale text;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_goal
  from public.goals
  where id = p_goal_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Goal not found';
  end if;

  if v_goal.status not in ('exploring', 'active') then
    raise exception 'Terminal Goals cannot be reopened or transitioned';
  end if;

  if v_goal.status = 'exploring' and p_new_status = 'active' then
    v_decision_type := 'committed';
  elsif v_goal.status in ('exploring', 'active') and p_new_status = 'achieved' then
    v_decision_type := 'achieved';
  elsif v_goal.status in ('exploring', 'active') and p_new_status = 'abandoned' then
    v_decision_type := case
      when p_replacement_goal_id is null then 'abandoned'
      else 'replaced'
    end;
  else
    raise exception 'Invalid Goal status transition from % to %', v_goal.status, p_new_status;
  end if;

  if p_replacement_goal_id is not null then
    if p_replacement_goal_id = p_goal_id then
      raise exception 'A Goal cannot replace itself';
    end if;

    perform 1
    from public.goals
    where id = p_replacement_goal_id
      and user_id = v_user_id
      and status in ('exploring', 'active')
      and archived_at is null
    for update;

    if not found then
      raise exception 'Replacement Goal not found or is terminal';
    end if;
  end if;

  if v_decision_type in ('abandoned', 'replaced')
    and nullif(btrim(p_rationale), '') is null then
    raise exception 'A rationale is required to abandon or replace a Goal';
  end if;

  v_rationale := coalesce(
    nullif(btrim(p_rationale), ''),
    case v_decision_type
      when 'committed' then 'Goal committed.'
      when 'achieved' then 'Goal achieved.'
      else null
    end
  );

  update public.goals
  set
    status = p_new_status,
    archived_at = case
      when p_new_status in ('achieved', 'abandoned') then clock_timestamp()
      else null
    end,
    replaced_by_goal_id = p_replacement_goal_id
  where id = p_goal_id
    and user_id = v_user_id;

  insert into public.goal_decisions (
    user_id,
    goal_id,
    decision_type,
    rationale,
    evidence_summary,
    consequence_summary,
    replacement_goal_id,
    created_via,
    source_proposal_id,
    decided_at
  )
  values (
    v_user_id,
    p_goal_id,
    v_decision_type,
    v_rationale,
    nullif(btrim(p_evidence_summary), ''),
    nullif(btrim(p_consequence_summary), ''),
    p_replacement_goal_id,
    p_created_via,
    p_source_proposal_id,
    p_decided_at
  )
  returning id into v_decision_id;

  return v_decision_id;
end;
$$;

create function public.update_project(
  p_project_id uuid,
  p_title text,
  p_desired_outcome text,
  p_goal_id uuid default null,
  p_parent_project_id uuid default null,
  p_target_start_date date default null,
  p_target_end_date date default null,
  p_target_confidence public.life_target_confidence default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_project public.projects%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_project
  from public.projects
  where id = p_project_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Project not found';
  end if;

  if v_project.status in ('completed', 'cancelled') then
    raise exception 'Terminal Projects cannot be changed';
  end if;

  if p_goal_id is not null and not exists (
    select 1
    from public.goals
    where id = p_goal_id
      and user_id = v_user_id
      and life_area_id = v_project.life_area_id
  ) then
    raise exception 'Goal does not belong to the Project Life Area';
  end if;

  if p_parent_project_id is not null and not exists (
    select 1
    from public.projects
    where id = p_parent_project_id
      and user_id = v_user_id
      and life_area_id = v_project.life_area_id
  ) then
    raise exception 'Parent Project does not belong to the selected Life Area';
  end if;

  update public.projects
  set
    title = btrim(p_title),
    desired_outcome = btrim(p_desired_outcome),
    goal_id = p_goal_id,
    parent_project_id = p_parent_project_id,
    target_start_date = p_target_start_date,
    target_end_date = p_target_end_date,
    target_confidence = p_target_confidence
  where id = p_project_id
    and user_id = v_user_id;
end;
$$;

create function public.transition_project_status(
  p_project_id uuid,
  p_new_status public.project_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_old_status public.project_status;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select status
  into v_old_status
  from public.projects
  where id = p_project_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Project not found';
  end if;

  if v_old_status in ('completed', 'cancelled') then
    raise exception 'Terminal Projects cannot be reopened or transitioned';
  end if;

  if not (
    (v_old_status = 'active' and p_new_status = 'paused')
    or (v_old_status = 'paused' and p_new_status = 'active')
    or (
      v_old_status in ('active', 'paused')
      and p_new_status in ('completed', 'cancelled')
    )
  ) then
    raise exception 'Invalid Project status transition from % to %', v_old_status, p_new_status;
  end if;

  update public.projects
  set
    status = p_new_status,
    archived_at = case
      when p_new_status in ('completed', 'cancelled') then clock_timestamp()
      else null
    end
  where id = p_project_id
    and user_id = v_user_id;
end;
$$;

create function public.update_routine(
  p_routine_id uuid,
  p_title text,
  p_cadence public.routine_cadence,
  p_estimated_minutes integer,
  p_goal_id uuid default null,
  p_project_id uuid default null,
  p_cadence_count smallint default null,
  p_weekdays smallint[] default '{}',
  p_preferred_time time without time zone default null,
  p_skip_policy public.routine_skip_policy default 'skip'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_routine public.routines%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_routine
  from public.routines
  where id = p_routine_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Routine not found';
  end if;

  if v_routine.status = 'ended' then
    raise exception 'Ended Routines cannot be changed';
  end if;

  if p_goal_id is not null and not exists (
    select 1
    from public.goals
    where id = p_goal_id
      and user_id = v_user_id
      and life_area_id = v_routine.life_area_id
  ) then
    raise exception 'Goal does not belong to the Routine Life Area';
  end if;

  if p_project_id is not null and not exists (
    select 1
    from public.projects
    where id = p_project_id
      and user_id = v_user_id
      and life_area_id = v_routine.life_area_id
  ) then
    raise exception 'Project does not belong to the Routine Life Area';
  end if;

  update public.routines
  set
    title = btrim(p_title),
    goal_id = p_goal_id,
    project_id = p_project_id,
    cadence = p_cadence,
    cadence_count = p_cadence_count,
    weekdays = coalesce(p_weekdays, '{}'::smallint[]),
    estimated_minutes = p_estimated_minutes,
    preferred_time = p_preferred_time,
    skip_policy = p_skip_policy
  where id = p_routine_id
    and user_id = v_user_id;
end;
$$;

create function public.transition_routine_status(
  p_routine_id uuid,
  p_new_status public.routine_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_old_status public.routine_status;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select status
  into v_old_status
  from public.routines
  where id = p_routine_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Routine not found';
  end if;

  if v_old_status = 'ended' then
    raise exception 'Ended Routines cannot be resumed or transitioned';
  end if;

  if not (
    (v_old_status = 'active' and p_new_status = 'paused')
    or (v_old_status = 'paused' and p_new_status = 'active')
    or (v_old_status in ('active', 'paused') and p_new_status = 'ended')
  ) then
    raise exception 'Invalid Routine status transition from % to %', v_old_status, p_new_status;
  end if;

  update public.routines
  set
    status = p_new_status,
    ended_at = case
      when p_new_status = 'ended' then clock_timestamp()
      else null
    end
  where id = p_routine_id
    and user_id = v_user_id;
end;
$$;

create function public.update_current_context(
  p_current_context_id uuid,
  p_title text,
  p_planning_impact text,
  p_started_on date,
  p_expected_end_start date default null,
  p_expected_end_end date default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_status public.current_context_status;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select status
  into v_status
  from public.current_contexts
  where id = p_current_context_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Current Context not found';
  end if;

  if v_status <> 'active' then
    raise exception 'Ended Current Contexts cannot be changed';
  end if;

  update public.current_contexts
  set
    title = btrim(p_title),
    planning_impact = btrim(p_planning_impact),
    started_on = p_started_on,
    expected_end_start = p_expected_end_start,
    expected_end_end = p_expected_end_end
  where id = p_current_context_id
    and user_id = v_user_id;
end;
$$;

create function public.end_current_context(
  p_current_context_id uuid,
  p_ended_on date default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_context public.current_contexts%rowtype;
  v_timezone text;
  v_ended_on date;
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

  select *
  into v_context
  from public.current_contexts
  where id = p_current_context_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Current Context not found';
  end if;

  if v_context.status = 'ended' then
    raise exception 'Ended Current Contexts cannot be reopened or transitioned';
  end if;

  v_ended_on := coalesce(
    p_ended_on,
    (clock_timestamp() at time zone v_timezone)::date
  );

  if v_ended_on < v_context.started_on then
    raise exception 'Current Context end date cannot precede its start date';
  end if;

  update public.current_contexts
  set
    status = 'ended',
    ended_on = v_ended_on
  where id = p_current_context_id
    and user_id = v_user_id;
end;
$$;

create function public.correct_life_evidence(
  p_life_evidence_id uuid,
  p_summary text,
  p_occurred_on date,
  p_signal public.life_evidence_signal
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_archived_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select archived_at
  into v_archived_at
  from public.life_evidence
  where id = p_life_evidence_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Life Evidence not found';
  end if;

  if v_archived_at is not null then
    raise exception 'Archived Life Evidence cannot be changed';
  end if;

  update public.life_evidence
  set
    summary = btrim(p_summary),
    occurred_on = p_occurred_on,
    signal = p_signal
  where id = p_life_evidence_id
    and user_id = v_user_id;
end;
$$;

create function public.archive_life_evidence(
  p_life_evidence_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_archived_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select archived_at
  into v_archived_at
  from public.life_evidence
  where id = p_life_evidence_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Life Evidence not found';
  end if;

  if v_archived_at is not null then
    return;
  end if;

  update public.life_evidence
  set archived_at = clock_timestamp()
  where id = p_life_evidence_id
    and user_id = v_user_id;
end;
$$;

revoke all on function public.rename_life_area(uuid, text)
from public, anon, authenticated;
revoke all on function public.reorder_life_areas(uuid[])
from public, anon, authenticated;
revoke all on function public.archive_life_area(uuid)
from public, anon, authenticated;
revoke all on function public.update_goal(
  uuid,
  text,
  text,
  date,
  date,
  public.life_target_confidence
) from public, anon, authenticated;
revoke all on function public.transition_goal_status(
  uuid,
  public.goal_status,
  text,
  text,
  text,
  uuid,
  public.life_model_provenance,
  uuid,
  timestamptz
) from public, anon, authenticated;
revoke all on function public.update_project(
  uuid,
  text,
  text,
  uuid,
  uuid,
  date,
  date,
  public.life_target_confidence
) from public, anon, authenticated;
revoke all on function public.transition_project_status(uuid, public.project_status)
from public, anon, authenticated;
revoke all on function public.update_routine(
  uuid,
  text,
  public.routine_cadence,
  integer,
  uuid,
  uuid,
  smallint,
  smallint[],
  time without time zone,
  public.routine_skip_policy
) from public, anon, authenticated;
revoke all on function public.transition_routine_status(uuid, public.routine_status)
from public, anon, authenticated;
revoke all on function public.update_current_context(
  uuid,
  text,
  text,
  date,
  date,
  date
) from public, anon, authenticated;
revoke all on function public.end_current_context(uuid, date)
from public, anon, authenticated;
revoke all on function public.correct_life_evidence(
  uuid,
  text,
  date,
  public.life_evidence_signal
) from public, anon, authenticated;
revoke all on function public.archive_life_evidence(uuid)
from public, anon, authenticated;

grant execute on function public.rename_life_area(uuid, text)
to authenticated;
grant execute on function public.reorder_life_areas(uuid[])
to authenticated;
grant execute on function public.archive_life_area(uuid)
to authenticated;
grant execute on function public.update_goal(
  uuid,
  text,
  text,
  date,
  date,
  public.life_target_confidence
) to authenticated;
grant execute on function public.transition_goal_status(
  uuid,
  public.goal_status,
  text,
  text,
  text,
  uuid,
  public.life_model_provenance,
  uuid,
  timestamptz
) to authenticated;
grant execute on function public.update_project(
  uuid,
  text,
  text,
  uuid,
  uuid,
  date,
  date,
  public.life_target_confidence
) to authenticated;
grant execute on function public.transition_project_status(uuid, public.project_status)
to authenticated;
grant execute on function public.update_routine(
  uuid,
  text,
  public.routine_cadence,
  integer,
  uuid,
  uuid,
  smallint,
  smallint[],
  time without time zone,
  public.routine_skip_policy
) to authenticated;
grant execute on function public.transition_routine_status(uuid, public.routine_status)
to authenticated;
grant execute on function public.update_current_context(
  uuid,
  text,
  text,
  date,
  date,
  date
) to authenticated;
grant execute on function public.end_current_context(uuid, date)
to authenticated;
grant execute on function public.correct_life_evidence(
  uuid,
  text,
  date,
  public.life_evidence_signal
) to authenticated;
grant execute on function public.archive_life_evidence(uuid)
to authenticated;

notify pgrst, 'reload schema';
