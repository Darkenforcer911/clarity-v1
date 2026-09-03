-- Canonical dated Action occurrences can exist before a Daily Plan. A Daily
-- Plan is optional membership; local_date is the Action occurrence date.
alter table public.daily_actions
  add column local_date date,
  add column due_local_date date,
  add column due_local_time time without time zone,
  add column reminder_offsets_minutes integer[] not null default '{}';

update public.daily_actions as action
set local_date = plan.local_date
from public.daily_plans as plan
where plan.id = action.daily_plan_id
  and plan.user_id = action.user_id;

-- Older, still-authoritative Daily Loop RPCs insert through a Daily Plan. Keep
-- those calls compatible while making local_date authoritative for every new
-- occurrence. A supplied date may never contradict its plan.
create or replace function private.ensure_daily_action_local_date()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan_date date;
begin
  if new.daily_plan_id is null then
    if new.local_date is null then
      raise exception 'A standalone Action requires a local date';
    end if;
    return new;
  end if;

  select plan.local_date
  into v_plan_date
  from public.daily_plans as plan
  where plan.id = new.daily_plan_id
    and plan.user_id = new.user_id;

  if v_plan_date is null then
    raise exception 'Daily plan not found for Action';
  end if;
  if new.local_date is null then
    new.local_date := v_plan_date;
  elsif new.local_date <> v_plan_date then
    raise exception 'Action date must match its Daily Plan date';
  end if;
  return new;
end;
$$;

create trigger daily_actions_ensure_local_date
before insert or update of daily_plan_id, local_date on public.daily_actions
for each row execute function private.ensure_daily_action_local_date();

alter table public.daily_actions
  alter column local_date set not null,
  alter column daily_plan_id drop not null,
  drop constraint daily_actions_details_evidence_only,
  add constraint daily_actions_details_length check (
    details is null
    or char_length(btrim(details)) between 1 and 2000
  ),
  add constraint daily_actions_due_shape check (
    due_local_date is null
    or (
      (completion_evidence_only or due_local_date >= local_date)
      and (due_local_time is null or due_local_date is not null)
    )
  ),
  add constraint daily_actions_due_time_has_date check (
    due_local_time is null or due_local_date is not null
  ),
  add constraint daily_actions_reminders_valid check (
    private.calendar_reminder_offsets_are_valid(
      reminder_offsets_minutes,
      false
    )
  ),
  add constraint daily_actions_reminders_have_clock_anchor check (
    cardinality(reminder_offsets_minutes) = 0
    or scheduled_time is not null
    or due_local_time is not null
  );

comment on column public.daily_actions.local_date is
  'Authoritative profile-local calendar date of this Action occurrence. Independent of optional Daily Plan membership.';
comment on column public.daily_actions.daily_plan_id is
  'Optional membership in a shaped Daily Plan. It is not the Action occurrence date or identity.';
comment on column public.daily_actions.due_local_date is
  'Optional profile-local due date owned by this Action occurrence; not a copied Calendar Deadline.';
comment on column public.daily_actions.due_local_time is
  'Optional profile-local due time. Null preserves date-only or unknown-time semantics.';
comment on column public.daily_actions.reminder_offsets_minutes is
  'Canonical reminder offsets for this Action occurrence. The scheduled time is the primary anchor; an exact due time is the fallback anchor.';
comment on column public.daily_actions.details is
  'Optional user-entered Action details. Valid for planned or completed-evidence Action occurrences.';

create index daily_actions_user_local_date_idx
  on public.daily_actions (user_id, local_date, sort_order);

create index daily_actions_due_local_date_idx
  on public.daily_actions (user_id, due_local_date)
  where due_local_date is not null;

-- Historical completed items already have honest duration/details columns.
-- Permit those fields for completed-item corrections so the shared completed
-- Action editor does not discard evidence or overload another field.
alter table public.day_corrections
  drop constraint day_corrections_type_fields,
  add constraint day_corrections_type_fields check (
    (
      correction_type = 'completed_item'
      and title is not null
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
  );

create or replace function private.validate_day_correction_input(
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

  if p_details is not null
    and (
      nullif(btrim(p_details), '') is null
      or char_length(btrim(p_details)) > 2000
    )
  then
    raise exception 'Correction details are invalid';
  end if;

  if p_duration_minutes is not null
    and p_duration_minutes not between 1 and 1440
  then
    raise exception 'Correction duration must be within one day';
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

-- A repeating Action is a Routine definition plus independent dated Action
-- occurrences. Routines may remain unclassified until the user establishes a
-- Life Area.
alter table public.routines
  alter column life_area_id drop not null,
  add column start_on date,
  add column details text,
  add column due_offset_days smallint,
  add column due_local_time time without time zone,
  add column reminder_offsets_minutes integer[] not null default '{}';

update public.routines as routine
set start_on = (routine.created_at at time zone profile.timezone)::date
from public.profiles as profile
where profile.id = routine.user_id;

-- Existing canonical Routine RPCs predate start_on. Derive it in the owner's
-- profile timezone when they create a Routine without an explicit anchor.
create or replace function private.ensure_routine_start_on()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_timezone text;
begin
  if new.start_on is not null then return new; end if;
  select profile.timezone into v_timezone
  from public.profiles as profile
  where profile.id = new.user_id;
  if v_timezone is null then raise exception 'Profile timezone not found'; end if;
  new.start_on := (coalesce(new.created_at, clock_timestamp()) at time zone v_timezone)::date;
  return new;
end;
$$;

create trigger routines_ensure_start_on
before insert on public.routines
for each row execute function private.ensure_routine_start_on();

alter table public.routines
  alter column start_on set not null,
  add constraint routines_unassigned_has_no_classified_children check (
    life_area_id is not null
    or (goal_id is null and project_id is null)
  ),
  add constraint routines_details_length check (
    details is null
    or char_length(btrim(details)) between 1 and 2000
  ),
  add constraint routines_due_offset_range check (
    due_offset_days is null or due_offset_days between 0 and 365
  ),
  add constraint routines_due_time_has_offset check (
    due_local_time is null or due_offset_days is not null
  ),
  add constraint routines_reminders_valid check (
    private.calendar_reminder_offsets_are_valid(
      reminder_offsets_minutes,
      false
    )
  ),
  add constraint routines_reminders_have_clock_anchor check (
    cardinality(reminder_offsets_minutes) = 0
    or preferred_time is not null
    or due_local_time is not null
  );

comment on column public.routines.life_area_id is
  'Optional canonical classification. Null means the repeating behaviour has not yet been assigned to a Life Area.';
comment on column public.routines.start_on is
  'Profile-local recurrence anchor date. A Routine never materializes dated Action occurrences before this date.';
comment on column public.routines.due_offset_days is
  'Per-occurrence due-date offset from each occurrence local_date. It is not a recurrence end date.';

drop index if exists public.daily_actions_plan_source_routine_key;
create unique index daily_actions_source_routine_date_key
  on public.daily_actions (user_id, source_routine_id, local_date)
  where source_routine_id is not null;

create or replace function private.routine_occurs_on_date(
  p_cadence public.routine_cadence,
  p_start_on date,
  p_weekdays smallint[],
  p_local_date date
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    p_local_date >= p_start_on
    and case p_cadence
      when 'daily' then true
      when 'weekly' then (p_local_date - p_start_on) % 7 = 0
      when 'certain_days' then
        extract(dow from p_local_date)::smallint = any(p_weekdays)
      -- times_per_week requires a planning choice. It is intentionally not
      -- fabricated into fixed weekdays by deterministic materialization.
      else false
    end;
$$;

create or replace function public.materialize_routine_action_occurrences(
  p_local_date date
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_timezone text;
  v_today date;
  v_plan public.daily_plans%rowtype;
  v_next_sort_order integer;
  v_changed integer := 0;
  v_inserted integer := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select profile.timezone
  into v_timezone
  from public.profiles as profile
  where profile.id = v_user_id;

  if v_timezone is null then
    raise exception 'Profile timezone not found';
  end if;

  v_today := (clock_timestamp() at time zone v_timezone)::date;
  if p_local_date < v_today then
    raise exception 'Routine occurrences cannot be materialized retrospectively';
  end if;

  select plan.*
  into v_plan
  from public.daily_plans as plan
  where plan.user_id = v_user_id
    and plan.local_date = p_local_date
    and plan.status in ('proposed', 'active')
  for update;

  perform 1
  from public.routines as routine
  where routine.user_id = v_user_id
    and routine.status = 'active'
  order by routine.id
  for update;

  select coalesce(max(action.sort_order), -1) + 1
  into v_next_sort_order
  from public.daily_actions as action
  where action.user_id = v_user_id
    and action.local_date = p_local_date
    and (
      (v_plan.id is not null and action.daily_plan_id = v_plan.id)
      or (v_plan.id is null and action.daily_plan_id is null)
    )
    and action.status <> 'removed';

  if v_plan.id is not null then
    update public.daily_actions as action
    set
      daily_plan_id = v_plan.id,
      status = case
        when v_plan.status = 'active'
          then 'active'::public.daily_action_status
        else 'proposed'::public.daily_action_status
      end,
      approved_at = case
        when v_plan.status = 'active' then v_plan.approved_at
        else null
      end,
      sort_order = v_next_sort_order + source.position
    from (
      select candidate.id,
        (row_number() over (order by candidate.sort_order, candidate.created_at, candidate.id) - 1)::integer as position
      from public.daily_actions as candidate
      where candidate.user_id = v_user_id
        and candidate.local_date = p_local_date
        and candidate.daily_plan_id is null
        and candidate.status = 'proposed'
    ) as source
    where action.id = source.id;

    get diagnostics v_changed = row_count;
    v_next_sort_order := v_next_sort_order + v_changed;
  end if;

  insert into public.daily_actions (
    id,
    user_id,
    daily_plan_id,
    local_date,
    title,
    action_type,
    status,
    estimated_minutes,
    scheduled_time,
    due_local_date,
    due_local_time,
    reminder_offsets_minutes,
    details,
    why_it_exists,
    definition_of_done,
    suggested_method,
    sort_order,
    approved_at,
    original_input,
    recurrence_pattern,
    recurrence_days,
    life_area_id,
    goal_id,
    project_id,
    source_routine_id,
    relationship_source
  )
  select
    gen_random_uuid(),
    v_user_id,
    v_plan.id,
    p_local_date,
    routine.title,
    case when routine.preferred_time is null then 'flexible' else 'fixed' end,
    case
      when v_plan.status = 'active' then 'active'::public.daily_action_status
      else 'proposed'::public.daily_action_status
    end,
    routine.estimated_minutes,
    case
      when routine.preferred_time is null then null
      else (p_local_date + routine.preferred_time) at time zone v_timezone
    end,
    case
      when routine.due_offset_days is null then null
      else p_local_date + routine.due_offset_days
    end,
    routine.due_local_time,
    routine.reminder_offsets_minutes,
    routine.details,
    'This repeating action applies on this date.',
    routine.title || ' is complete.',
    'Complete the action as planned.',
    v_next_sort_order
      + (row_number() over (order by routine.created_at, routine.id) - 1)::integer,
    case when v_plan.status = 'active' then v_plan.approved_at else null end,
    routine.title,
    'none',
    '{}'::smallint[],
    routine.life_area_id,
    routine.goal_id,
    routine.project_id,
    routine.id,
    routine.created_via
  from public.routines as routine
  where routine.user_id = v_user_id
    and routine.status = 'active'
    and private.routine_occurs_on_date(
      routine.cadence,
      routine.start_on,
      routine.weekdays,
      p_local_date
    )
    and not exists (
      select 1
      from public.daily_actions as existing
      where existing.user_id = v_user_id
        and existing.source_routine_id = routine.id
        and existing.local_date = p_local_date
    )
  order by routine.created_at, routine.id
  on conflict (user_id, source_routine_id, local_date)
    where source_routine_id is not null
    do nothing;

  get diagnostics v_inserted = row_count;
  return v_changed + v_inserted;
end;
$$;

create or replace function public.create_action_occurrence_v1(
  p_local_date date,
  p_title text,
  p_duration_minutes integer,
  p_daily_plan_id uuid default null,
  p_when_time time without time zone default null,
  p_due_local_date date default null,
  p_due_local_time time without time zone default null,
  p_recurrence_pattern text default 'none',
  p_recurrence_days smallint[] default '{}',
  p_reminder_offsets_minutes integer[] default '{}',
  p_details text default null,
  p_completed boolean default false,
  p_completion_evidence_only boolean default false,
  p_linked_context_label text default null,
  p_linked_context_kind text default null,
  p_ongoing_context_suggestion text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_timezone text;
  v_today date;
  v_plan public.daily_plans%rowtype;
  v_title text := nullif(btrim(p_title), '');
  v_details text := nullif(btrim(p_details), '');
  v_linked_context_label text := nullif(btrim(p_linked_context_label), '');
  v_ongoing_context_suggestion text := nullif(btrim(p_ongoing_context_suggestion), '');
  v_reminders integer[];
  v_scheduled_time timestamptz;
  v_completed_at timestamptz;
  v_routine_id uuid;
  v_routine_start date;
  v_cadence public.routine_cadence;
  v_routine_weekdays smallint[] := '{}';
  v_due_offset smallint;
  v_sort_order integer;
  v_action_id uuid := gen_random_uuid();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select profile.timezone
  into v_timezone
  from public.profiles as profile
  where profile.id = v_user_id;
  if v_timezone is null then
    raise exception 'Profile timezone not found';
  end if;
  v_today := (clock_timestamp() at time zone v_timezone)::date;

  if p_local_date is null then
    raise exception 'Action date is required';
  end if;
  if v_title is null or char_length(v_title) > 200 then
    raise exception 'Action title must be between 1 and 200 characters';
  end if;
  if p_completed then
    if p_local_date > v_today then
      raise exception 'Completed activity cannot be recorded in the future';
    end if;
    if p_duration_minutes is not between 0 and 1440 then
      raise exception 'Completed Action duration must be between 0 and 1440 minutes';
    end if;
  elsif p_local_date < v_today then
    raise exception 'A planned Action cannot be created in the past';
  elsif p_duration_minutes is not between 1 and 1440 then
    raise exception 'Action duration must be between 1 and 1440 minutes';
  end if;
  if v_details is not null and char_length(v_details) > 2000 then
    raise exception 'Details must be 2000 characters or fewer';
  end if;
  if (v_linked_context_label is null) <> (p_linked_context_kind is null) then
    raise exception 'Linked context label and kind must be set together';
  end if;
  if p_linked_context_kind is not null and p_linked_context_kind not in ('project', 'area') then
    raise exception 'Unknown linked context kind';
  end if;
  if v_linked_context_label is not null and char_length(v_linked_context_label) > 100 then
    raise exception 'Linked context label is too long';
  end if;
  if v_ongoing_context_suggestion is not null and char_length(v_ongoing_context_suggestion) > 100 then
    raise exception 'Ongoing context suggestion is too long';
  end if;
  if p_due_local_time is not null and p_due_local_date is null then
    raise exception 'A due time requires a due date';
  end if;
  if p_due_local_date is not null
    and p_due_local_date < p_local_date
    and (not p_completed or p_recurrence_pattern <> 'none')
  then
    raise exception 'Due must be on or after the Action date';
  end if;
  if p_recurrence_pattern <> 'none'
    and p_due_local_date is not null
    and p_due_local_date - p_local_date > 365
  then
    raise exception 'A repeating Action Due must be within 365 days of its occurrence';
  end if;

  if p_recurrence_pattern not in ('none', 'daily', 'weekly', 'certain_days')
    or p_recurrence_days is null
    or not (p_recurrence_days <@ array[0,1,2,3,4,5,6]::smallint[])
    or cardinality(p_recurrence_days) > 7
    or (
      p_recurrence_pattern = 'certain_days'
      and cardinality(p_recurrence_days) = 0
    )
    or (
      p_recurrence_pattern <> 'certain_days'
      and cardinality(p_recurrence_days) > 0
    )
  then
    raise exception 'Action recurrence is invalid';
  end if;

  v_reminders := private.canonicalize_calendar_reminder_offsets(
    coalesce(p_reminder_offsets_minutes, '{}'::integer[])
  );
  if not private.calendar_reminder_offsets_are_valid(v_reminders, false) then
    raise exception 'Action reminder offsets are invalid';
  end if;
  if cardinality(v_reminders) > 0
    and p_when_time is null
    and p_due_local_time is null
  then
    raise exception 'Action reminders require When or an exact Due time';
  end if;

  if p_when_time is not null then
    if p_completed then
      v_completed_at := (p_local_date + p_when_time) at time zone v_timezone;
      if v_completed_at > clock_timestamp() then
        raise exception 'Completion time cannot be in the future';
      end if;
    else
      v_scheduled_time := (p_local_date + p_when_time) at time zone v_timezone;
      if v_scheduled_time <= clock_timestamp() then
        raise exception 'A new Action cannot be scheduled in the past';
      end if;
    end if;
  end if;

  if p_daily_plan_id is not null then
    select plan.* into v_plan
    from public.daily_plans as plan
    where plan.id = p_daily_plan_id
      and plan.user_id = v_user_id
    for update;
    if v_plan.id is null then raise exception 'Daily plan not found'; end if;
    if v_plan.local_date <> p_local_date
      or v_plan.status not in ('proposed', 'active')
    then
      raise exception 'Action date does not match an editable Daily Plan';
    end if;
  elsif not p_completed then
    select plan.* into v_plan
    from public.daily_plans as plan
    where plan.user_id = v_user_id
      and plan.local_date = p_local_date
      and plan.status in ('proposed', 'active')
    for update;
  end if;

  if p_recurrence_pattern <> 'none' then
    if p_completed and p_duration_minutes = 0 then
      raise exception 'Add Duration before making completed activity repeat';
    end if;
    if p_completed
      and cardinality(v_reminders) > 0
      and p_due_local_time is null
    then
      raise exception 'A repeating completed Action needs an exact Due time for reminders';
    end if;
    v_routine_start := case
      when p_completed and p_recurrence_pattern = 'weekly'
        then p_local_date + 7
      when p_completed then p_local_date + 1
      else p_local_date
    end;
    v_cadence := case p_recurrence_pattern
      when 'daily' then 'daily'::public.routine_cadence
      when 'weekly' then 'weekly'::public.routine_cadence
      else 'certain_days'::public.routine_cadence
    end;
    v_routine_weekdays := case
      when p_recurrence_pattern = 'certain_days' then p_recurrence_days
      else '{}'::smallint[]
    end;
    v_due_offset := case
      when p_due_local_date is null then null
      else (p_due_local_date - p_local_date)::smallint
    end;

    insert into public.routines (
      user_id,
      life_area_id,
      title,
      status,
      cadence,
      weekdays,
      estimated_minutes,
      preferred_time,
      skip_policy,
      created_via,
      start_on,
      details,
      due_offset_days,
      due_local_time,
      reminder_offsets_minutes
    ) values (
      v_user_id,
      null,
      v_title,
      'active',
      v_cadence,
      v_routine_weekdays,
      p_duration_minutes,
      case when p_completed then null else p_when_time end,
      'skip',
      'user_stated',
      v_routine_start,
      v_details,
      v_due_offset,
      p_due_local_time,
      v_reminders
    ) returning id into v_routine_id;
  end if;

  select coalesce(max(action.sort_order), -1) + 1
  into v_sort_order
  from public.daily_actions as action
  where action.user_id = v_user_id
    and action.local_date = p_local_date
    and action.daily_plan_id is not distinct from v_plan.id;

  insert into public.daily_actions (
    id, user_id, daily_plan_id, local_date, title, action_type, status,
    estimated_minutes, actual_minutes, scheduled_time, due_local_date,
    due_local_time, reminder_offsets_minutes, details, why_it_exists,
    definition_of_done, suggested_method, sort_order, completed_at,
    completion_recorded_at, completion_time_unknown,
    completion_evidence_only, approved_at, original_input,
    recurrence_pattern, recurrence_days, source_routine_id,
    relationship_source, linked_context_label, linked_context_kind,
    ongoing_context_suggestion
  ) values (
    v_action_id,
    v_user_id,
    v_plan.id,
    p_local_date,
    v_title,
    case when p_when_time is null or p_completed then 'flexible' else 'fixed' end,
    case
      when p_completed then 'completed'::public.daily_action_status
      when v_plan.status = 'active' then 'active'::public.daily_action_status
      else 'proposed'::public.daily_action_status
    end,
    case when p_completed and p_completion_evidence_only then 0 else greatest(p_duration_minutes, 1) end,
    case when p_completed then nullif(p_duration_minutes, 0) else null end,
    v_scheduled_time,
    p_due_local_date,
    p_due_local_time,
    case when p_completed then '{}'::integer[] else v_reminders end,
    v_details,
    coalesce('Context: ' || v_details, 'Added by the user.'),
    v_title,
    'Complete the action as planned.',
    v_sort_order,
    v_completed_at,
    case when p_completed then clock_timestamp() else null end,
    p_completed and v_completed_at is null,
    p_completed and p_completion_evidence_only,
    case when v_plan.status = 'active' then v_plan.approved_at else null end,
    v_title,
    'none',
    '{}'::smallint[],
    v_routine_id,
    case when v_routine_id is null then null else 'user_stated' end,
    v_linked_context_label,
    p_linked_context_kind,
    v_ongoing_context_suggestion
  );

  if p_completed then
    perform private.touch_profile_and_record_event(
      v_user_id,
      'action_completed',
      jsonb_build_object(
        'dailyPlanId', v_plan.id,
        'dailyActionId', v_action_id,
        'completedEvidenceOnly', p_completion_evidence_only
      )
    );
  else
    update public.profiles set last_active_at = clock_timestamp()
    where id = v_user_id;
  end if;
  return v_action_id;
end;
$$;

create or replace function public.update_completed_action_occurrence_v1(
  p_daily_action_id uuid,
  p_title text,
  p_completed_time time without time zone default null,
  p_actual_minutes integer default null,
  p_due_local_date date default null,
  p_due_local_time time without time zone default null,
  p_recurrence_pattern text default 'none',
  p_recurrence_days smallint[] default '{}',
  p_reminder_offsets_minutes integer[] default '{}',
  p_details text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_action public.daily_actions%rowtype;
  v_plan public.daily_plans%rowtype;
  v_timezone text;
  v_now timestamptz := clock_timestamp();
  v_title text := nullif(btrim(p_title), '');
  v_details text := nullif(btrim(p_details), '');
  v_completed_at timestamptz;
  v_reminders integer[];
  v_routine_id uuid;
  v_cadence public.routine_cadence;
  v_weekdays smallint[] := '{}';
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;

  select action.* into v_action
  from public.daily_actions as action
  where action.id = p_daily_action_id and action.user_id = v_user_id
  for update;
  if v_action.id is null then raise exception 'Completed item not found'; end if;

  select plan.* into v_plan
  from public.daily_plans as plan
  where plan.id = v_action.daily_plan_id and plan.user_id = v_user_id
  for update;
  if v_plan.id is null
    or v_plan.status <> 'proposed'
    or v_plan.approved_at is not null
    or v_action.status <> 'completed'
    or not v_action.completion_evidence_only
    or v_action.approved_at is not null
  then
    raise exception 'Only completed activity in the current proposal can be edited';
  end if;

  select profile.timezone into v_timezone
  from public.profiles as profile where profile.id = v_user_id;
  if v_timezone is null then raise exception 'Profile timezone not found'; end if;
  if v_plan.local_date <> (v_now at time zone v_timezone)::date then
    raise exception 'Today has changed. Return to Today before editing this item';
  end if;
  if v_title is null or char_length(v_title) > 200 then
    raise exception 'Describe what you completed';
  end if;
  if p_actual_minutes is not null and p_actual_minutes not between 1 and 1440 then
    raise exception 'Duration must be between 1 and 1440 minutes';
  end if;
  if v_details is not null and char_length(v_details) > 2000 then
    raise exception 'Details must be 2000 characters or fewer';
  end if;
  if p_due_local_time is not null and p_due_local_date is null then
    raise exception 'A due time requires a due date';
  end if;
  if p_recurrence_pattern not in ('none', 'daily', 'weekly', 'certain_days')
    or p_recurrence_days is null
    or not (p_recurrence_days <@ array[0,1,2,3,4,5,6]::smallint[])
    or cardinality(p_recurrence_days) > 7
    or (p_recurrence_pattern = 'certain_days' and cardinality(p_recurrence_days) = 0)
    or (p_recurrence_pattern <> 'certain_days' and cardinality(p_recurrence_days) > 0)
  then
    raise exception 'Action recurrence is invalid';
  end if;
  if p_recurrence_pattern <> 'none'
    and p_due_local_date is not null
    and p_due_local_date < v_action.local_date
  then
    raise exception 'A repeating Action Due must be on or after this occurrence';
  end if;
  if p_recurrence_pattern <> 'none'
    and p_due_local_date is not null
    and p_due_local_date - v_action.local_date > 365
  then
    raise exception 'A repeating Action Due must be within 365 days of its occurrence';
  end if;

  v_reminders := private.canonicalize_calendar_reminder_offsets(
    coalesce(p_reminder_offsets_minutes, '{}'::integer[])
  );
  if not private.calendar_reminder_offsets_are_valid(v_reminders, false) then
    raise exception 'Action reminder offsets are invalid';
  end if;
  if cardinality(v_reminders) > 0
    and (p_recurrence_pattern = 'none' or p_due_local_time is null)
  then
    raise exception 'Completed activity reminders require a repeating Action with an exact Due time';
  end if;
  if p_recurrence_pattern <> 'none' and p_actual_minutes is null then
    raise exception 'Add Duration before making completed activity repeat';
  end if;

  if p_completed_time is not null then
    v_completed_at := (v_action.local_date + p_completed_time) at time zone v_timezone;
    if date_trunc('minute', v_completed_at) > date_trunc('minute', v_now) then
      raise exception 'Completion time cannot be in the future';
    end if;
  end if;

  v_routine_id := v_action.source_routine_id;
  if p_recurrence_pattern = 'none' and v_routine_id is not null then
    update public.routines set status = 'ended', ended_at = v_now
    where id = v_routine_id and user_id = v_user_id and status <> 'ended';
    delete from public.daily_actions
    where user_id = v_user_id
      and source_routine_id = v_routine_id
      and local_date > v_action.local_date
      and daily_plan_id is null
      and status = 'proposed';
    v_routine_id := null;
  elsif p_recurrence_pattern <> 'none' then
    v_cadence := case p_recurrence_pattern
      when 'daily' then 'daily'::public.routine_cadence
      when 'weekly' then 'weekly'::public.routine_cadence
      else 'certain_days'::public.routine_cadence
    end;
    v_weekdays := case when p_recurrence_pattern = 'certain_days'
      then p_recurrence_days else '{}'::smallint[] end;

    if v_routine_id is null then
      insert into public.routines (
        user_id, life_area_id, title, status, cadence, weekdays,
        estimated_minutes, preferred_time, skip_policy, created_via,
        start_on, details, due_offset_days, due_local_time,
        reminder_offsets_minutes
      ) values (
        v_user_id, null, v_title, 'active', v_cadence, v_weekdays,
        p_actual_minutes, null, 'skip', 'user_stated',
        case when p_recurrence_pattern = 'weekly'
          then v_action.local_date + 7
          else v_action.local_date + 1 end,
        v_details,
        case when p_due_local_date is null then null
          else (p_due_local_date - v_action.local_date)::smallint end,
        p_due_local_time, v_reminders
      ) returning id into v_routine_id;
    else
      update public.routines
      set title = v_title,
          start_on = case when p_recurrence_pattern = 'weekly'
            then v_action.local_date + 7
            else v_action.local_date + 1 end,
          cadence = v_cadence,
          weekdays = v_weekdays,
          estimated_minutes = p_actual_minutes,
          details = v_details,
          due_offset_days = case when p_due_local_date is null then null
            else (p_due_local_date - v_action.local_date)::smallint end,
          due_local_time = p_due_local_time,
          reminder_offsets_minutes = v_reminders
      where id = v_routine_id and user_id = v_user_id and status = 'active';
      if not found then raise exception 'Repeating Action is no longer active'; end if;
      delete from public.daily_actions
      where user_id = v_user_id
        and source_routine_id = v_routine_id
        and local_date > v_action.local_date
        and daily_plan_id is null
        and status = 'proposed';
    end if;
  end if;

  update public.daily_actions
  set title = v_title,
      definition_of_done = v_title,
      completed_at = v_completed_at,
      completion_recorded_at = v_now,
      completion_time_unknown = v_completed_at is null,
      actual_minutes = p_actual_minutes,
      due_local_date = p_due_local_date,
      due_local_time = p_due_local_time,
      reminder_offsets_minutes = '{}',
      details = v_details,
      source_routine_id = v_routine_id,
      relationship_source = case when v_routine_id is null then null else 'user_stated' end
  where id = v_action.id and user_id = v_user_id;

  update public.profiles set last_active_at = v_now where id = v_user_id;
end;
$$;

-- Remove one dated occurrence without changing a linked Routine definition.
-- The retained removed/dropped row is also the occurrence exception that keeps
-- deterministic materialization from recreating that date.
create or replace function public.remove_action_occurrence_v1(
  p_daily_action_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_timezone text;
  v_today date;
  v_action public.daily_actions%rowtype;
  v_plan public.daily_plans%rowtype;
  v_next_status public.daily_action_status;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;

  select profile.timezone into v_timezone
  from public.profiles as profile where profile.id = v_user_id;
  if v_timezone is null then raise exception 'Profile timezone not found'; end if;
  v_today := (clock_timestamp() at time zone v_timezone)::date;

  select action.* into v_action
  from public.daily_actions as action
  where action.id = p_daily_action_id and action.user_id = v_user_id
  for update;
  if v_action.id is null then raise exception 'Action not found'; end if;
  if v_action.completion_evidence_only
    or v_action.local_date < v_today
    or v_action.status not in ('proposed', 'active')
  then
    raise exception 'Only an unfinished current or future Action occurrence can be removed';
  end if;

  if v_action.daily_plan_id is not null then
    select plan.* into v_plan
    from public.daily_plans as plan
    where plan.id = v_action.daily_plan_id and plan.user_id = v_user_id
    for update;
    if v_plan.id is null then raise exception 'Daily plan not found'; end if;
    if v_plan.status not in ('proposed', 'active') then
      raise exception 'This Action occurrence can no longer be removed';
    end if;
  end if;

  v_next_status := case
    when v_action.status = 'active' then 'dropped'::public.daily_action_status
    else 'removed'::public.daily_action_status
  end;

  update public.daily_actions
  set status = v_next_status,
      completed_at = null,
      completion_recorded_at = null,
      completion_time_unknown = false,
      rescheduled_for = null,
      reminder_offsets_minutes = '{}',
      resolution_note = case
        when v_next_status = 'dropped' then 'Removed from today'
        else 'Removed occurrence'
      end
  where id = v_action.id and user_id = v_user_id;

  if v_next_status = 'dropped' then
    perform private.touch_profile_and_record_event(
      v_user_id,
      'action_removed_from_today',
      jsonb_build_object(
        'dailyActionId', v_action.id,
        'dailyPlanId', v_action.daily_plan_id,
        'localDate', v_action.local_date,
        'occurrenceOnly', true
      )
    );
  else
    update public.profiles set last_active_at = clock_timestamp()
    where id = v_user_id;
  end if;
end;
$$;

create or replace function public.update_action_occurrence_v1(
  p_daily_action_id uuid,
  p_title text,
  p_duration_minutes integer,
  p_when_time time without time zone default null,
  p_due_local_date date default null,
  p_due_local_time time without time zone default null,
  p_reminder_offsets_minutes integer[] default '{}',
  p_details text default null,
  p_recurrence_pattern text default 'none',
  p_recurrence_days smallint[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_action public.daily_actions%rowtype;
  v_plan public.daily_plans%rowtype;
  v_timezone text;
  v_title text := nullif(btrim(p_title), '');
  v_details text := nullif(btrim(p_details), '');
  v_reminders integer[];
  v_scheduled_time timestamptz;
  v_routine_id uuid;
  v_cadence public.routine_cadence;
  v_weekdays smallint[] := '{}';
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;

  select action.* into v_action
  from public.daily_actions as action
  where action.id = p_daily_action_id and action.user_id = v_user_id
  for update;
  if v_action.id is null then raise exception 'Action not found'; end if;
  if v_action.completion_evidence_only then
    raise exception 'Use completed-evidence correction for this Action';
  end if;

  if v_action.daily_plan_id is not null then
    select plan.* into v_plan
    from public.daily_plans as plan
    where plan.id = v_action.daily_plan_id and plan.user_id = v_user_id
    for update;
  end if;
  if not (
    (v_action.daily_plan_id is null and v_action.status = 'proposed')
    or (v_plan.status = 'proposed' and v_action.status = 'proposed')
    or (v_plan.status = 'active' and v_action.status = 'active')
  ) then
    raise exception 'This Action cannot be edited in its current state';
  end if;

  select profile.timezone into v_timezone
  from public.profiles as profile where profile.id = v_user_id;
  if v_timezone is null then raise exception 'Profile timezone not found'; end if;
  if v_title is null or char_length(v_title) > 200 then
    raise exception 'Action title must be between 1 and 200 characters';
  end if;
  if p_duration_minutes not between 1 and 1440 then
    raise exception 'Action duration must be between 1 and 1440 minutes';
  end if;
  if v_details is not null and char_length(v_details) > 2000 then
    raise exception 'Details must be 2000 characters or fewer';
  end if;
  if p_due_local_time is not null and p_due_local_date is null then
    raise exception 'A due time requires a due date';
  end if;
  if p_due_local_date is not null and p_due_local_date < v_action.local_date then
    raise exception 'Due must be on or after the Action date';
  end if;
  if p_recurrence_pattern <> 'none'
    and p_due_local_date is not null
    and p_due_local_date - v_action.local_date > 365
  then
    raise exception 'A repeating Action Due must be within 365 days of its occurrence';
  end if;
  if p_recurrence_pattern not in ('none', 'daily', 'weekly', 'certain_days')
    or p_recurrence_days is null
    or not (p_recurrence_days <@ array[0,1,2,3,4,5,6]::smallint[])
    or cardinality(p_recurrence_days) > 7
    or (p_recurrence_pattern = 'certain_days' and cardinality(p_recurrence_days) = 0)
    or (p_recurrence_pattern <> 'certain_days' and cardinality(p_recurrence_days) > 0)
  then
    raise exception 'Action recurrence is invalid';
  end if;

  v_reminders := private.canonicalize_calendar_reminder_offsets(
    coalesce(p_reminder_offsets_minutes, '{}'::integer[])
  );
  if not private.calendar_reminder_offsets_are_valid(v_reminders, false) then
    raise exception 'Action reminder offsets are invalid';
  end if;
  if cardinality(v_reminders) > 0 and p_when_time is null and p_due_local_time is null then
    raise exception 'Action reminders require When or an exact Due time';
  end if;
  if p_when_time is not null then
    v_scheduled_time := (v_action.local_date + p_when_time) at time zone v_timezone;
    if v_scheduled_time <= clock_timestamp()
      and v_scheduled_time is distinct from v_action.scheduled_time
    then
      raise exception 'A new scheduled time must be in the future';
    end if;
  end if;

  update public.daily_actions
  set
    title = v_title,
    action_type = case when p_when_time is null then 'flexible' else 'fixed' end,
    estimated_minutes = p_duration_minutes,
    scheduled_time = v_scheduled_time,
    due_local_date = p_due_local_date,
    due_local_time = p_due_local_time,
    reminder_offsets_minutes = v_reminders,
    details = v_details,
    why_it_exists = case
      when v_details is not null then 'Context: ' || v_details
      when why_it_exists like 'Context: %' then 'Added by the user.'
      else why_it_exists
    end,
    original_input = coalesce(original_input, v_title)
  where id = v_action.id and user_id = v_user_id;

  v_routine_id := v_action.source_routine_id;
  if p_recurrence_pattern = 'none' and v_routine_id is not null then
    update public.routines
    set status = 'ended', ended_at = clock_timestamp()
    where id = v_routine_id and user_id = v_user_id and status <> 'ended';
    delete from public.daily_actions
    where user_id = v_user_id
      and source_routine_id = v_routine_id
      and local_date > v_action.local_date
      and daily_plan_id is null
      and status = 'proposed';
    v_routine_id := null;
    update public.daily_actions
    set source_routine_id = null, relationship_source = case
      when num_nonnulls(life_area_id, goal_id, project_id, source_calendar_commitment_id) = 0 then null
      else relationship_source
    end
    where id = v_action.id and user_id = v_user_id;
  elsif p_recurrence_pattern <> 'none' then
    v_cadence := case p_recurrence_pattern
      when 'daily' then 'daily'::public.routine_cadence
      when 'weekly' then 'weekly'::public.routine_cadence
      else 'certain_days'::public.routine_cadence
    end;
    v_weekdays := case when p_recurrence_pattern = 'certain_days'
      then p_recurrence_days else '{}'::smallint[] end;

    if v_routine_id is null then
      insert into public.routines (
        user_id, life_area_id, title, status, cadence, weekdays,
        estimated_minutes, preferred_time, skip_policy, created_via,
        start_on, details, due_offset_days, due_local_time,
        reminder_offsets_minutes
      ) values (
        v_user_id, null, v_title, 'active', v_cadence, v_weekdays,
        p_duration_minutes, p_when_time, 'skip', 'user_stated',
        v_action.local_date, v_details,
        case when p_due_local_date is null then null
          else (p_due_local_date - v_action.local_date)::smallint end,
        p_due_local_time, v_reminders
      ) returning id into v_routine_id;
      update public.daily_actions
      set source_routine_id = v_routine_id, relationship_source = 'user_stated'
      where id = v_action.id and user_id = v_user_id;
    else
      update public.routines
      set status = 'active', ended_at = null,
        cadence = v_cadence, weekdays = v_weekdays
      where id = v_routine_id and user_id = v_user_id and status <> 'ended';
      delete from public.daily_actions
      where user_id = v_user_id
        and source_routine_id = v_routine_id
        and local_date > v_action.local_date
        and daily_plan_id is null
        and status = 'proposed';
    end if;
  end if;

  update public.profiles set last_active_at = clock_timestamp()
  where id = v_user_id;
end;
$$;

-- Preserve user-created and Routine-backed canonical occurrences while the
-- deterministic proposal is regenerated, then attach them to the same plan.
create or replace function public.save_context_only_proposed_plan(
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
  v_existing_plan_id uuid;
  v_timezone text;
  v_placeholder_time timestamptz := clock_timestamp();
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  select profile.timezone into v_timezone
  from public.profiles as profile where profile.id = v_user_id;
  if v_timezone is null then raise exception 'Profile timezone not found'; end if;
  if p_local_date is distinct from (clock_timestamp() at time zone v_timezone)::date then
    raise exception 'Routine occurrences can only be materialized for the profile-local current date';
  end if;

  select plan.id into v_existing_plan_id
  from public.daily_plans as plan
  where plan.user_id = v_user_id and plan.local_date = p_local_date
  for update;

  if v_existing_plan_id is not null then
    update public.daily_actions
    set daily_plan_id = null
    where daily_plan_id = v_existing_plan_id
      and user_id = v_user_id
      and status = 'proposed'
      and (original_input is not null or source_routine_id is not null);
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
  set woke_at = null, aiming_to_sleep_at = null
  where id = v_plan_id and user_id = v_user_id;
  if not found then raise exception 'Daily plan not found'; end if;

  perform public.materialize_routine_action_occurrences(p_local_date);
  return v_plan_id;
end;
$$;

-- Notification deliveries retain one dispatcher and one idempotency model,
-- with an explicit one-of target instead of copying Actions into Calendar.
alter table public.notification_deliveries
  alter column calendar_commitment_id drop not null,
  add column daily_action_id uuid,
  add constraint notification_deliveries_action_owner_fk foreign key (
    daily_action_id, user_id
  ) references public.daily_actions(id, user_id) on delete cascade;

alter table public.notification_deliveries
  drop constraint notification_deliveries_idempotency_unique,
  add constraint notification_deliveries_exactly_one_target check (
    num_nonnulls(calendar_commitment_id, daily_action_id) = 1
  );

create unique index notification_deliveries_calendar_idempotency_key
  on public.notification_deliveries (
    push_subscription_id,
    calendar_commitment_id,
    occurrence_date,
    reminder_offset_minutes
  ) where calendar_commitment_id is not null;

create unique index notification_deliveries_action_idempotency_key
  on public.notification_deliveries (
    push_subscription_id,
    daily_action_id,
    occurrence_date,
    reminder_offset_minutes
  ) where daily_action_id is not null;

create or replace function private.action_notification_delivery_schedule(
  p_scheduled_time timestamptz,
  p_due_local_date date,
  p_due_local_time time without time zone,
  p_timezone text,
  p_reminder_offset_minutes integer
)
returns table (scheduled_for timestamptz, useful_until timestamptz)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_anchor timestamptz;
begin
  if p_reminder_offset_minutes < 0 then
    raise exception 'Reminder offset must be non-negative';
  end if;
  v_anchor := coalesce(
    p_scheduled_time,
    (p_due_local_date + p_due_local_time) at time zone p_timezone
  );
  if v_anchor is null then raise exception 'Action reminder has no clock anchor'; end if;
  scheduled_for := v_anchor - make_interval(mins => p_reminder_offset_minutes);
  useful_until := case
    when p_reminder_offset_minutes = 0 then scheduled_for + interval '10 minutes'
    else least(scheduled_for + interval '2 hours', v_anchor)
  end;
  return next;
end;
$$;

create or replace function public.materialize_notification_deliveries(
  p_now timestamptz default clock_timestamp()
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_calendar_count integer := 0;
  v_action_count integer := 0;
begin
  insert into public.notification_deliveries (
    user_id, push_subscription_id, calendar_commitment_id,
    occurrence_date, reminder_offset_minutes, scheduled_for
  )
  select commitment.user_id, subscription.id, commitment.id,
    candidate.occurrence_date, reminder.reminder_offset_minutes,
    schedule.scheduled_for
  from public.calendar_commitments as commitment
  join public.push_subscriptions as subscription
    on subscription.user_id = commitment.user_id
    and subscription.enabled
    and (subscription.expiration_time is null or subscription.expiration_time > p_now)
  cross join lateral (
    select (((p_now at time zone commitment.timezone)::date + day_offset)::date) as occurrence_date
    from generate_series(0, 30) as day_offset
  ) as candidate
  cross join lateral unnest(commitment.reminder_offsets_minutes)
    as reminder(reminder_offset_minutes)
  cross join lateral private.notification_delivery_schedule(
    commitment.commitment_type, candidate.occurrence_date,
    commitment.event_start_time, commitment.deadline_due_time,
    commitment.timezone, reminder.reminder_offset_minutes
  ) as schedule
  where commitment.status = 'scheduled'
    and private.calendar_commitment_occurs_on_date(
      commitment.local_date, commitment.recurrence_unit,
      commitment.recurrence_interval, commitment.recurrence_weekdays,
      candidate.occurrence_date
    )
    and not exists (
      select 1 from public.calendar_commitment_occurrences as occurrence
      where occurrence.calendar_commitment_id = commitment.id
        and occurrence.occurrence_date = candidate.occurrence_date
    )
    and schedule.scheduled_for <= p_now
    and schedule.scheduled_for > p_now - interval '2 hours'
    and p_now < schedule.useful_until
  on conflict (
    push_subscription_id, calendar_commitment_id,
    occurrence_date, reminder_offset_minutes
  ) where calendar_commitment_id is not null
  do update set
    scheduled_for = excluded.scheduled_for,
    status = 'pending', attempt_count = 0, next_attempt_at = null,
    lease_expires_at = null, sent_at = null, last_error_code = null
  where notification_deliveries.sent_at is null
    and (
      notification_deliveries.status = 'cancelled'
      or (
        notification_deliveries.status in ('pending','retry','failed')
        and notification_deliveries.scheduled_for is distinct from excluded.scheduled_for
      )
    );
  get diagnostics v_calendar_count = row_count;

  insert into public.notification_deliveries (
    user_id, push_subscription_id, daily_action_id,
    occurrence_date, reminder_offset_minutes, scheduled_for
  )
  select action.user_id, subscription.id, action.id, action.local_date,
    reminder.reminder_offset_minutes, schedule.scheduled_for
  from public.daily_actions as action
  join public.profiles as profile on profile.id = action.user_id
  join public.push_subscriptions as subscription
    on subscription.user_id = action.user_id
    and subscription.enabled
    and (subscription.expiration_time is null or subscription.expiration_time > p_now)
  cross join lateral unnest(action.reminder_offsets_minutes)
    as reminder(reminder_offset_minutes)
  cross join lateral private.action_notification_delivery_schedule(
    action.scheduled_time, action.due_local_date, action.due_local_time,
    profile.timezone, reminder.reminder_offset_minutes
  ) as schedule
  where action.status in ('proposed','active')
    and not action.completion_evidence_only
    and schedule.scheduled_for <= p_now
    and schedule.scheduled_for > p_now - interval '2 hours'
    and p_now < schedule.useful_until
  on conflict (
    push_subscription_id, daily_action_id,
    occurrence_date, reminder_offset_minutes
  ) where daily_action_id is not null
  do update set
    scheduled_for = excluded.scheduled_for,
    status = 'pending', attempt_count = 0, next_attempt_at = null,
    lease_expires_at = null, sent_at = null, last_error_code = null
  where notification_deliveries.sent_at is null
    and (
      notification_deliveries.status = 'cancelled'
      or (
        notification_deliveries.status in ('pending','retry','failed')
        and notification_deliveries.scheduled_for is distinct from excluded.scheduled_for
      )
    );
  get diagnostics v_action_count = row_count;

  update public.notification_deliveries as delivery
  set status = 'cancelled', next_attempt_at = null,
    lease_expires_at = null, last_error_code = 'stale_or_ineligible'
  where delivery.daily_action_id is not null
    and delivery.sent_at is null
    and delivery.status in ('pending','retry','processing','failed')
    and not exists (
      select 1 from public.daily_actions as action
      where action.id = delivery.daily_action_id
        and action.user_id = delivery.user_id
        and action.status in ('proposed','active')
        and delivery.reminder_offset_minutes = any(action.reminder_offsets_minutes)
    );

  return v_calendar_count + v_action_count;
end;
$$;

create or replace function public.revalidate_notification_delivery(
  p_delivery_id uuid,
  p_now timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivery public.notification_deliveries%rowtype;
  v_commitment public.calendar_commitments%rowtype;
  v_action public.daily_actions%rowtype;
  v_subscription public.push_subscriptions%rowtype;
  v_timezone text;
  v_scheduled_for timestamptz;
  v_useful_until timestamptz;
  v_valid boolean := false;
begin
  select * into v_delivery from public.notification_deliveries
  where id = p_delivery_id for update;
  if v_delivery.id is null or v_delivery.status <> 'processing'
    or v_delivery.sent_at is not null or v_delivery.lease_expires_at is null
    or v_delivery.lease_expires_at <= p_now
  then return null; end if;

  select * into v_subscription from public.push_subscriptions
  where id = v_delivery.push_subscription_id
    and user_id = v_delivery.user_id for update;

  if v_delivery.calendar_commitment_id is not null then
    select * into v_commitment from public.calendar_commitments
    where id = v_delivery.calendar_commitment_id
      and user_id = v_delivery.user_id for update;
    if v_commitment.id is not null then
      select schedule.scheduled_for, schedule.useful_until
      into v_scheduled_for, v_useful_until
      from private.notification_delivery_schedule(
        v_commitment.commitment_type, v_delivery.occurrence_date,
        v_commitment.event_start_time, v_commitment.deadline_due_time,
        v_commitment.timezone, v_delivery.reminder_offset_minutes
      ) as schedule;
    end if;
    v_valid := v_commitment.id is not null
      and v_commitment.status = 'scheduled'
      and v_delivery.reminder_offset_minutes = any(v_commitment.reminder_offsets_minutes)
      and private.calendar_commitment_occurs_on_date(
        v_commitment.local_date, v_commitment.recurrence_unit,
        v_commitment.recurrence_interval, v_commitment.recurrence_weekdays,
        v_delivery.occurrence_date
      )
      and not exists (
        select 1 from public.calendar_commitment_occurrences as occurrence
        where occurrence.calendar_commitment_id = v_commitment.id
          and occurrence.occurrence_date = v_delivery.occurrence_date
      );
  else
    select action.* into v_action from public.daily_actions as action
    where action.id = v_delivery.daily_action_id
      and action.user_id = v_delivery.user_id for update;
    select profile.timezone into v_timezone from public.profiles as profile
    where profile.id = v_delivery.user_id;
    if v_action.id is not null then
      select schedule.scheduled_for, schedule.useful_until
      into v_scheduled_for, v_useful_until
      from private.action_notification_delivery_schedule(
        v_action.scheduled_time, v_action.due_local_date,
        v_action.due_local_time, v_timezone,
        v_delivery.reminder_offset_minutes
      ) as schedule;
    end if;
    v_valid := v_action.id is not null
      and v_action.status in ('proposed','active')
      and not v_action.completion_evidence_only
      and v_delivery.occurrence_date = v_action.local_date
      and v_delivery.reminder_offset_minutes = any(v_action.reminder_offsets_minutes);
  end if;

  v_valid := coalesce(v_valid, false)
    and v_subscription.id is not null
    and v_subscription.enabled
    and (v_subscription.expiration_time is null or v_subscription.expiration_time > p_now)
    and v_scheduled_for = v_delivery.scheduled_for
    and v_delivery.scheduled_for <= p_now
    and p_now < v_useful_until;

  if not v_valid then
    update public.notification_deliveries set
      status = 'cancelled', lease_expires_at = null,
      next_attempt_at = null, last_error_code = 'stale_or_ineligible'
    where id = v_delivery.id and status = 'processing';
    return null;
  end if;

  return jsonb_build_object(
    'deliveryId', v_delivery.id,
    'attemptCount', v_delivery.attempt_count,
    'endpoint', v_subscription.endpoint,
    'p256dhKey', v_subscription.p256dh_key,
    'authKey', v_subscription.auth_key,
    'targetType', case when v_action.id is null then 'calendar' else 'action' end,
    'commitmentId', v_commitment.id,
    'commitmentType', v_commitment.commitment_type,
    'actionId', v_action.id,
    'actionReminderAnchor', case
      when v_action.id is null then null
      when v_action.scheduled_time is not null then 'when'
      else 'due'
    end,
    'title', coalesce(v_action.title, v_commitment.title),
    'occurrenceDate', v_delivery.occurrence_date,
    'reminderOffsetMinutes', v_delivery.reminder_offset_minutes,
    'scheduledFor', v_delivery.scheduled_for,
    'usefulUntil', v_useful_until
  );
end;
$$;

-- Retry windows use the same target-specific schedule as revalidation. The
-- original dispatcher only understood Calendar commitments, which would make
-- a transient Action push failure terminal instead of safely retryable.
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

  if p_disable_subscription then
    update public.push_subscriptions
    set
      enabled = false,
      disabled_at = coalesce(disabled_at, p_now)
    where id = v_delivery.push_subscription_id
      and user_id = v_delivery.user_id;
  end if;

  return v_final_status;
end;
$$;

revoke all on function public.materialize_routine_action_occurrences(date)
  from public, anon, authenticated;
grant execute on function public.materialize_routine_action_occurrences(date)
  to authenticated;

revoke all on function public.create_action_occurrence_v1(
  date, text, integer, uuid, time without time zone, date,
  time without time zone, text, smallint[], integer[], text, boolean, boolean,
  text, text, text
) from public, anon, authenticated;
grant execute on function public.create_action_occurrence_v1(
  date, text, integer, uuid, time without time zone, date,
  time without time zone, text, smallint[], integer[], text, boolean, boolean,
  text, text, text
) to authenticated;

revoke all on function public.update_completed_action_occurrence_v1(
  uuid, text, time without time zone, integer, date,
  time without time zone, text, smallint[], integer[], text
) from public, anon, authenticated;
grant execute on function public.update_completed_action_occurrence_v1(
  uuid, text, time without time zone, integer, date,
  time without time zone, text, smallint[], integer[], text
) to authenticated;

revoke all on function public.update_action_occurrence_v1(
  uuid, text, integer, time without time zone, date,
  time without time zone, integer[], text, text, smallint[]
) from public, anon, authenticated;
grant execute on function public.update_action_occurrence_v1(
  uuid, text, integer, time without time zone, date,
  time without time zone, integer[], text, text, smallint[]
) to authenticated;

revoke all on function public.remove_action_occurrence_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.remove_action_occurrence_v1(uuid)
  to authenticated;

revoke all on function public.save_context_only_proposed_plan(date, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_context_only_proposed_plan(date, text, text, jsonb)
  to authenticated;

revoke all on function public.materialize_notification_deliveries(timestamptz)
  from public, anon, authenticated;
revoke all on function public.revalidate_notification_delivery(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.materialize_notification_deliveries(timestamptz)
  to service_role;
grant execute on function public.revalidate_notification_delivery(uuid, timestamptz)
  to service_role;

notify pgrst, 'reload schema';
