alter table public.daily_actions
  add column original_input text,
  add column clarification_question text,
  add column clarification_answer text,
  add column recurrence_pattern text not null default 'none',
  add column recurrence_days smallint[] not null default '{}',
  add column linked_context_label text,
  add column linked_context_kind text,
  add column ongoing_context_suggestion text,
  add column ongoing_context_decision text;

alter table public.daily_actions
  add constraint daily_actions_original_input_length check (
    original_input is null or char_length(original_input) between 1 and 200
  ),
  add constraint daily_actions_clarification_question_length check (
    clarification_question is null
    or char_length(clarification_question) between 1 and 500
  ),
  add constraint daily_actions_clarification_answer_length check (
    clarification_answer is null
    or char_length(clarification_answer) between 1 and 1000
  ),
  add constraint daily_actions_clarification_provenance check (
    clarification_answer is null or clarification_question is not null
  ),
  add constraint daily_actions_recurrence_pattern_check check (
    recurrence_pattern in ('none', 'daily', 'weekly', 'certain_days')
  ),
  add constraint daily_actions_recurrence_days_check check (
    recurrence_days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]
    and cardinality(recurrence_days) <= 7
    and (
      (
        recurrence_pattern = 'certain_days'
        and cardinality(recurrence_days) > 0
      )
      or (
        recurrence_pattern <> 'certain_days'
        and cardinality(recurrence_days) = 0
      )
    )
  ),
  add constraint daily_actions_linked_context_pair_check check (
    (
      linked_context_label is null
      and linked_context_kind is null
    )
    or (
      linked_context_label is not null
      and linked_context_kind in ('project', 'area')
    )
  ),
  add constraint daily_actions_linked_context_label_length check (
    linked_context_label is null
    or char_length(linked_context_label) between 1 and 100
  ),
  add constraint daily_actions_ongoing_context_suggestion_length check (
    ongoing_context_suggestion is null
    or char_length(ongoing_context_suggestion) between 1 and 100
  ),
  add constraint daily_actions_ongoing_context_decision_check check (
    ongoing_context_decision is null
    or ongoing_context_decision in ('remembered', 'once', 'dismissed')
  ),
  add constraint daily_actions_ongoing_context_pair_check check (
    ongoing_context_decision is null
    or ongoing_context_suggestion is not null
  );

create index daily_actions_remembered_context_idx
  on public.daily_actions (user_id, ongoing_context_decision)
  where ongoing_context_decision = 'remembered';

drop function public.add_daily_action(
  uuid,
  text,
  text,
  integer,
  timestamptz,
  text,
  text,
  text
);

create function public.add_daily_action(
  p_daily_plan_id uuid,
  p_title text,
  p_action_type text,
  p_estimated_minutes integer,
  p_scheduled_time timestamptz default null,
  p_why_it_exists text default null,
  p_definition_of_done text default null,
  p_suggested_method text default null,
  p_original_input text default null,
  p_clarification_question text default null,
  p_clarification_answer text default null,
  p_recurrence_pattern text default 'none',
  p_recurrence_days smallint[] default '{}',
  p_linked_context_label text default null,
  p_linked_context_kind text default null,
  p_ongoing_context_suggestion text default null,
  p_start_on date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan public.daily_plans%rowtype;
  v_action_id uuid := gen_random_uuid();
  v_sort_order integer;
  v_status public.daily_action_status;
  v_timezone text;
  v_title text := nullif(btrim(p_title), '');
  v_original_input text := nullif(btrim(p_original_input), '');
  v_clarification_question text := nullif(btrim(p_clarification_question), '');
  v_clarification_answer text := nullif(btrim(p_clarification_answer), '');
  v_linked_context_label text := nullif(btrim(p_linked_context_label), '');
  v_ongoing_context_suggestion text :=
    nullif(btrim(p_ongoing_context_suggestion), '');
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

  if v_plan.status not in ('proposed', 'active') then
    raise exception 'Actions can only be added to a proposed or active plan';
  end if;

  select timezone
  into v_timezone
  from public.profiles
  where id = v_user_id;

  if v_timezone is null then
    raise exception 'Profile timezone not found';
  end if;

  if v_title is null or char_length(v_title) > 200 then
    raise exception 'Action title must be between 1 and 200 characters';
  end if;

  if v_original_input is null or char_length(v_original_input) > 200 then
    raise exception 'Original action input must be between 1 and 200 characters';
  end if;

  if v_clarification_question is not null
    and char_length(v_clarification_question) > 500
  then
    raise exception 'Clarification question is too long';
  end if;

  if v_clarification_answer is not null
    and char_length(v_clarification_answer) > 1000
  then
    raise exception 'Clarification answer is too long';
  end if;

  if v_clarification_answer is not null
    and v_clarification_question is null
  then
    raise exception 'A clarification answer requires its question';
  end if;

  if p_action_type not in ('fixed', 'flexible') then
    raise exception 'Unknown action timing';
  end if;

  if p_estimated_minutes not between 1 and 1440 then
    raise exception 'Estimated minutes must be between 1 and 1440';
  end if;

  if p_action_type = 'fixed' and p_scheduled_time is null then
    raise exception 'A specific-time action requires a scheduled time';
  end if;

  if p_action_type = 'flexible' and p_scheduled_time is not null then
    raise exception 'An anytime action cannot have a scheduled time';
  end if;

  if p_start_on is not null and p_start_on <= v_plan.local_date then
    raise exception 'A future start date must be after the plan date';
  end if;

  if p_scheduled_time is not null
    and (p_scheduled_time at time zone v_timezone)::date
      <> coalesce(p_start_on, v_plan.local_date)
  then
    raise exception 'Scheduled time does not match the action date';
  end if;

  if p_recurrence_pattern = 'none'
    and p_start_on is null
    and p_scheduled_time is not null
    and p_scheduled_time <= now()
  then
    raise exception 'A new one-off action cannot be scheduled in the past';
  end if;

  if p_recurrence_pattern not in ('none', 'daily', 'weekly', 'certain_days')
  then
    raise exception 'Unknown recurrence pattern';
  end if;

  if p_recurrence_days is null
    or not (
      p_recurrence_days
      <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]
    )
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
    raise exception 'Invalid recurrence days';
  end if;

  if (v_linked_context_label is null) <> (p_linked_context_kind is null) then
    raise exception 'Linked context label and kind must be set together';
  end if;

  if p_linked_context_kind is not null
    and p_linked_context_kind not in ('project', 'area')
  then
    raise exception 'Unknown linked context kind';
  end if;

  if v_linked_context_label is not null
    and char_length(v_linked_context_label) > 100
  then
    raise exception 'Linked context label is too long';
  end if;

  if v_ongoing_context_suggestion is not null
    and char_length(v_ongoing_context_suggestion) > 100
  then
    raise exception 'Ongoing context suggestion is too long';
  end if;

  select coalesce(max(sort_order), -1) + 1
  into v_sort_order
  from public.daily_actions
  where daily_plan_id = v_plan.id
    and user_id = v_user_id
    and status <> 'removed';

  v_status := case
    when p_start_on is not null
      then 'rescheduled'::public.daily_action_status
    when v_plan.status = 'proposed'
      then 'proposed'::public.daily_action_status
    else 'active'::public.daily_action_status
  end;

  insert into public.daily_actions (
    id,
    user_id,
    daily_plan_id,
    title,
    action_type,
    status,
    estimated_minutes,
    scheduled_time,
    why_it_exists,
    definition_of_done,
    suggested_method,
    sort_order,
    approved_at,
    rescheduled_for,
    original_input,
    clarification_question,
    clarification_answer,
    recurrence_pattern,
    recurrence_days,
    linked_context_label,
    linked_context_kind,
    ongoing_context_suggestion
  )
  values (
    v_action_id,
    v_user_id,
    v_plan.id,
    v_title,
    p_action_type,
    v_status,
    p_estimated_minutes,
    p_scheduled_time,
    coalesce(
      nullif(btrim(p_why_it_exists), ''),
      'Added because it matters today.'
    ),
    coalesce(
      nullif(btrim(p_definition_of_done), ''),
      v_title || ' is complete.'
    ),
    coalesce(
      nullif(btrim(p_suggested_method), ''),
      'Start with the smallest clear next step.'
    ),
    v_sort_order,
    case when v_status = 'active' then now() else null end,
    p_start_on,
    v_original_input,
    v_clarification_question,
    v_clarification_answer,
    p_recurrence_pattern,
    p_recurrence_days,
    v_linked_context_label,
    p_linked_context_kind,
    v_ongoing_context_suggestion
  );

  update public.profiles
  set last_active_at = now()
  where id = v_user_id;

  return v_action_id;
end;
$$;

create function public.set_action_context_decision(
  p_daily_action_id uuid,
  p_decision text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_action public.daily_actions%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_decision not in ('remembered', 'once', 'dismissed') then
    raise exception 'Unknown context decision';
  end if;

  select *
  into v_action
  from public.daily_actions
  where id = p_daily_action_id
    and user_id = v_user_id
  for update;

  if v_action.id is null then
    raise exception 'Action not found';
  end if;

  if v_action.ongoing_context_suggestion is null then
    raise exception 'This action has no context suggestion';
  end if;

  update public.daily_actions
  set
    ongoing_context_decision = p_decision,
    linked_context_label = case
      when p_decision = 'remembered'
        then ongoing_context_suggestion
      else linked_context_label
    end,
    linked_context_kind = case
      when p_decision = 'remembered'
        then 'project'
      else linked_context_kind
    end
  where id = v_action.id;

  update public.profiles
  set last_active_at = now()
  where id = v_user_id;
end;
$$;

revoke all on function public.add_daily_action(
  uuid,
  text,
  text,
  integer,
  timestamptz,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  smallint[],
  text,
  text,
  text,
  date
) from public, anon;

revoke all on function public.set_action_context_decision(uuid, text)
  from public, anon;

grant execute on function public.add_daily_action(
  uuid,
  text,
  text,
  integer,
  timestamptz,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  smallint[],
  text,
  text,
  text,
  date
) to authenticated;

grant execute on function public.set_action_context_decision(uuid, text)
  to authenticated;
