create type public.action_assistant_role as enum ('user', 'assistant');

alter table public.daily_actions
add column approved_at timestamptz;

update public.daily_actions as action
set approved_at = plan.approved_at
from public.daily_plans as plan
where plan.id = action.daily_plan_id
  and plan.user_id = action.user_id
  and plan.approved_at is not null
  and action.status <> 'removed';

alter table public.daily_actions
add constraint daily_actions_id_user_id_key unique (id, user_id);

create table public.action_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  daily_action_id uuid not null,
  note text not null,
  created_at timestamptz not null default now(),
  constraint action_notes_action_owner_fkey
    foreign key (daily_action_id, user_id)
    references public.daily_actions(id, user_id)
    on delete cascade,
  constraint action_notes_note_length check (char_length(note) between 1 and 2000)
);

create table public.action_assistant_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  daily_action_id uuid not null,
  role public.action_assistant_role not null,
  content text not null,
  created_at timestamptz not null default now(),
  constraint action_assistant_messages_action_owner_fkey
    foreign key (daily_action_id, user_id)
    references public.daily_actions(id, user_id)
    on delete cascade,
  constraint action_assistant_messages_content_length
    check (char_length(content) between 1 and 5000)
);

create index action_notes_action_created_at_idx
  on public.action_notes (daily_action_id, created_at);

create index action_assistant_messages_action_created_at_idx
  on public.action_assistant_messages (daily_action_id, created_at);

alter table public.action_notes enable row level security;
alter table public.action_notes force row level security;
alter table public.action_assistant_messages enable row level security;
alter table public.action_assistant_messages force row level security;

create policy "Users can read their own action notes"
on public.action_notes
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can read their own action assistant messages"
on public.action_assistant_messages
for select
to authenticated
using ((select auth.uid()) = user_id);

create or replace function public.add_daily_action(
  p_daily_plan_id uuid,
  p_title text,
  p_action_type text,
  p_estimated_minutes integer,
  p_scheduled_time timestamptz default null,
  p_why_it_exists text default null,
  p_definition_of_done text default null,
  p_suggested_method text default null
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
  v_title text := nullif(btrim(p_title), '');
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

  if v_title is null or char_length(v_title) > 200 then
    raise exception 'Action title must be between 1 and 200 characters';
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

  select coalesce(max(sort_order), -1) + 1
  into v_sort_order
  from public.daily_actions
  where daily_plan_id = v_plan.id
    and user_id = v_user_id
    and status <> 'removed';

  v_status := case
    when v_plan.status = 'proposed' then 'proposed'::public.daily_action_status
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
    approved_at
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
    case when v_status = 'active' then now() else null end
  );

  update public.profiles
  set last_active_at = now()
  where id = v_user_id;

  return v_action_id;
end;
$$;

create or replace function public.update_daily_action(
  p_daily_action_id uuid,
  p_title text,
  p_action_type text,
  p_estimated_minutes integer,
  p_scheduled_time timestamptz,
  p_why_it_exists text,
  p_definition_of_done text,
  p_suggested_method text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_action public.daily_actions%rowtype;
  v_plan_status public.daily_plan_status;
  v_title text := nullif(btrim(p_title), '');
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_action
  from public.daily_actions
  where id = p_daily_action_id
    and user_id = v_user_id
  for update;

  if v_action.id is null then
    raise exception 'Daily action not found';
  end if;

  select status
  into v_plan_status
  from public.daily_plans
  where id = v_action.daily_plan_id
    and user_id = v_user_id
  for update;

  if not (
    (v_plan_status = 'proposed' and v_action.status = 'proposed')
    or (
      v_plan_status = 'active'
      and v_action.status in ('active', 'completed')
    )
  ) then
    raise exception 'This action cannot be edited in its current state';
  end if;

  if v_title is null or char_length(v_title) > 200 then
    raise exception 'Action title must be between 1 and 200 characters';
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

  update public.daily_actions
  set
    title = v_title,
    action_type = p_action_type,
    estimated_minutes = p_estimated_minutes,
    scheduled_time = p_scheduled_time,
    why_it_exists = btrim(p_why_it_exists),
    definition_of_done = btrim(p_definition_of_done),
    suggested_method = btrim(p_suggested_method)
  where id = v_action.id;

  update public.profiles
  set last_active_at = now()
  where id = v_user_id;
end;
$$;

create or replace function public.reschedule_proposed_action(
  p_daily_action_id uuid,
  p_target_date date
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
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_action
  from public.daily_actions
  where id = p_daily_action_id
    and user_id = v_user_id
  for update;

  if v_action.id is null then
    raise exception 'Daily action not found';
  end if;

  select *
  into v_plan
  from public.daily_plans
  where id = v_action.daily_plan_id
    and user_id = v_user_id
  for update;

  if v_plan.status <> 'proposed' or v_action.status <> 'proposed' then
    raise exception 'Only a proposed action can be moved before approval';
  end if;

  if p_target_date <= v_plan.local_date then
    raise exception 'The target date must be after the plan date';
  end if;

  update public.daily_actions
  set
    status = 'rescheduled',
    rescheduled_for = p_target_date,
    resolution_note = 'Moved before plan approval'
  where id = v_action.id;

  update public.profiles
  set last_active_at = now()
  where id = v_user_id;
end;
$$;

create or replace function public.approve_daily_plan(p_daily_plan_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan public.daily_plans%rowtype;
  v_approved_action_count integer;
  v_approved_at timestamptz := now();
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

  if v_plan.status <> 'proposed' then
    raise exception 'Only a proposed plan can be approved';
  end if;

  select count(*)
  into v_approved_action_count
  from public.daily_actions
  where daily_plan_id = v_plan.id
    and user_id = v_user_id
    and status = 'proposed';

  if v_approved_action_count < 1 then
    raise exception 'A plan must contain at least one proposed action';
  end if;

  update public.daily_actions
  set
    status = 'active',
    approved_at = v_approved_at
  where daily_plan_id = v_plan.id
    and user_id = v_user_id
    and status = 'proposed';

  update public.daily_plans
  set
    status = 'active',
    approved_at = v_approved_at
  where id = v_plan.id;

  perform private.touch_profile_and_record_event(
    v_user_id,
    'plan_approved',
    jsonb_build_object(
      'dailyPlanId', v_plan.id,
      'actionCount', v_approved_action_count
    )
  );
end;
$$;

create or replace function public.adapt_daily_action(
  p_daily_action_id uuid,
  p_title text,
  p_action_type text,
  p_estimated_minutes integer,
  p_scheduled_time timestamptz,
  p_why_it_exists text,
  p_definition_of_done text,
  p_suggested_method text,
  p_outcome text default 'keep',
  p_target_date date default null
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
  v_title text := nullif(btrim(p_title), '');
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_action
  from public.daily_actions
  where id = p_daily_action_id
    and user_id = v_user_id
  for update;

  if v_action.id is null then
    raise exception 'Daily action not found';
  end if;

  select *
  into v_plan
  from public.daily_plans
  where id = v_action.daily_plan_id
    and user_id = v_user_id
  for update;

  if v_plan.status <> 'active'
    or v_action.status not in ('active', 'completed')
  then
    raise exception 'Only an action in Active Today can be adapted';
  end if;

  if p_outcome not in ('keep', 'reschedule', 'drop') then
    raise exception 'Unknown adaptation outcome';
  end if;

  if v_action.status = 'completed' and p_outcome <> 'keep' then
    raise exception 'Mark this action incomplete before moving or dropping it';
  end if;

  if v_title is null or char_length(v_title) > 200 then
    raise exception 'Action title must be between 1 and 200 characters';
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

  if p_outcome = 'reschedule'
    and (p_target_date is null or p_target_date <= v_plan.local_date)
  then
    raise exception 'Choose a future date';
  end if;

  update public.daily_actions
  set
    title = v_title,
    action_type = p_action_type,
    estimated_minutes = p_estimated_minutes,
    scheduled_time = p_scheduled_time,
    why_it_exists = btrim(p_why_it_exists),
    definition_of_done = btrim(p_definition_of_done),
    suggested_method = btrim(p_suggested_method),
    status = case
      when p_outcome = 'reschedule'
        then 'rescheduled'::public.daily_action_status
      when p_outcome = 'drop'
        then 'dropped'::public.daily_action_status
      else v_action.status
    end,
    rescheduled_for = case
      when p_outcome = 'reschedule' then p_target_date
      else null
    end,
    resolution_note = case
      when p_outcome = 'reschedule' then 'Moved while adapting action'
      when p_outcome = 'drop' then 'Dropped while adapting action'
      else null
    end,
    completed_at = case
      when p_outcome in ('reschedule', 'drop') then null
      else v_action.completed_at
    end
  where id = v_action.id;

  update public.profiles
  set last_active_at = now()
  where id = v_user_id;
end;
$$;

create or replace function public.log_action_note(
  p_daily_action_id uuid,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_note_id uuid;
  v_note text := nullif(btrim(p_note), '');
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if v_note is null or char_length(v_note) > 2000 then
    raise exception 'Note must be between 1 and 2000 characters';
  end if;

  if not exists (
    select 1
    from public.daily_actions
    where id = p_daily_action_id
      and user_id = v_user_id
      and status <> 'removed'
  ) then
    raise exception 'Daily action not found';
  end if;

  insert into public.action_notes (user_id, daily_action_id, note)
  values (v_user_id, p_daily_action_id, v_note)
  returning id into v_note_id;

  update public.profiles
  set last_active_at = now()
  where id = v_user_id;

  return v_note_id;
end;
$$;

create or replace function public.save_action_assistant_exchange(
  p_daily_action_id uuid,
  p_question text,
  p_response text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_question text := nullif(btrim(p_question), '');
  v_response text := nullif(btrim(p_response), '');
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if v_question is null or char_length(v_question) > 2000 then
    raise exception 'Question must be between 1 and 2000 characters';
  end if;

  if v_response is null or char_length(v_response) > 5000 then
    raise exception 'Assistant response must be between 1 and 5000 characters';
  end if;

  if not exists (
    select 1
    from public.daily_actions
    where id = p_daily_action_id
      and user_id = v_user_id
      and status <> 'removed'
  ) then
    raise exception 'Daily action not found';
  end if;

  insert into public.action_assistant_messages (
    user_id,
    daily_action_id,
    role,
    content
  )
  values
    (v_user_id, p_daily_action_id, 'user', v_question),
    (v_user_id, p_daily_action_id, 'assistant', v_response);

  update public.profiles
  set last_active_at = now()
  where id = v_user_id;
end;
$$;

create or replace function public.finish_day(
  p_daily_plan_id uuid,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan public.daily_plans%rowtype;
  v_day_record_id uuid;
  v_recorded_at timestamptz := now();
  v_completed_count integer;
  v_total_count integer;
  v_completed_actions jsonb;
  v_unfinished_actions jsonb;
  v_progress_recorded jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_notes is not null and char_length(p_notes) > 5000 then
    raise exception 'Close Day notes are too long';
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

  if v_plan.status <> 'closing' then
    raise exception 'Only a closing plan can be finished';
  end if;

  perform 1
  from public.daily_actions
  where daily_plan_id = v_plan.id
    and user_id = v_user_id
  for update;

  if exists (
    select 1
    from public.daily_actions
    where daily_plan_id = v_plan.id
      and user_id = v_user_id
      and approved_at is not null
      and status in ('active', 'proposed')
  ) then
    raise exception 'Every unfinished action must be explicitly resolved';
  end if;

  if exists (
    select 1
    from public.daily_actions
    where daily_plan_id = v_plan.id
      and user_id = v_user_id
      and approved_at is not null
      and (
        (status = 'rescheduled' and rescheduled_for is null)
        or (status = 'dropped' and rescheduled_for is not null)
      )
  ) then
    raise exception 'One or more action resolutions are invalid';
  end if;

  select
    count(*) filter (where status = 'completed'),
    count(*) filter (where status in ('completed', 'rescheduled', 'dropped'))
  into
    v_completed_count,
    v_total_count
  from public.daily_actions
  where daily_plan_id = v_plan.id
    and user_id = v_user_id
    and approved_at is not null;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'title', title
      )
      order by sort_order
    ),
    '[]'::jsonb
  )
  into v_completed_actions
  from public.daily_actions
  where daily_plan_id = v_plan.id
    and user_id = v_user_id
    and approved_at is not null
    and status = 'completed';

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'title', title,
        'outcome', status::text,
        'rescheduledFor', rescheduled_for
      )
      order by sort_order
    ),
    '[]'::jsonb
  )
  into v_unfinished_actions
  from public.daily_actions
  where daily_plan_id = v_plan.id
    and user_id = v_user_id
    and approved_at is not null
    and status in ('rescheduled', 'dropped');

  v_progress_recorded := jsonb_build_object(
    'version', 1,
    'dailyPlanId', v_plan.id,
    'localDate', v_plan.local_date,
    'focus', v_plan.focus,
    'completedCount', v_completed_count,
    'totalCount', v_total_count,
    'completedActions', v_completed_actions,
    'unfinishedActions', v_unfinished_actions,
    'recordedAt', v_recorded_at
  );

  insert into public.day_records (
    user_id,
    daily_plan_id,
    notes,
    progress_recorded
  )
  values (
    v_user_id,
    v_plan.id,
    nullif(btrim(p_notes), ''),
    v_progress_recorded
  )
  returning id into v_day_record_id;

  update public.daily_plans
  set
    status = 'closed',
    closed_at = v_recorded_at
  where id = v_plan.id;

  perform private.touch_profile_and_record_event(
    v_user_id,
    'day_closed',
    jsonb_build_object(
      'dailyPlanId', v_plan.id,
      'completedCount', v_completed_count,
      'totalCount', v_total_count
    )
  );

  return v_day_record_id;
end;
$$;

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
    and approved_at is not null
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

revoke all on table public.action_notes from anon, authenticated;
revoke all on table public.action_assistant_messages from anon, authenticated;
grant select on public.action_notes to authenticated;
grant select on public.action_assistant_messages to authenticated;

revoke all on function public.add_daily_action(
  uuid,
  text,
  text,
  integer,
  timestamptz,
  text,
  text,
  text
) from public, anon;
revoke all on function public.update_daily_action(
  uuid,
  text,
  text,
  integer,
  timestamptz,
  text,
  text,
  text
) from public, anon;
revoke all on function public.reschedule_proposed_action(uuid, date)
  from public, anon;
revoke all on function public.adapt_daily_action(
  uuid,
  text,
  text,
  integer,
  timestamptz,
  text,
  text,
  text,
  text,
  date
) from public, anon;
revoke all on function public.log_action_note(uuid, text) from public, anon;
revoke all on function public.save_action_assistant_exchange(uuid, text, text)
  from public, anon;

grant execute on function public.add_daily_action(
  uuid,
  text,
  text,
  integer,
  timestamptz,
  text,
  text,
  text
) to authenticated;
grant execute on function public.update_daily_action(
  uuid,
  text,
  text,
  integer,
  timestamptz,
  text,
  text,
  text
) to authenticated;
grant execute on function public.reschedule_proposed_action(uuid, date)
  to authenticated;
grant execute on function public.adapt_daily_action(
  uuid,
  text,
  text,
  integer,
  timestamptz,
  text,
  text,
  text,
  text,
  date
) to authenticated;
grant execute on function public.log_action_note(uuid, text) to authenticated;
grant execute on function public.save_action_assistant_exchange(uuid, text, text)
  to authenticated;
