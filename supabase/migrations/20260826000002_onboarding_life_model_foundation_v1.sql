create type public.life_open_question_status as enum (
  'open',
  'resolved',
  'dismissed'
);

create type public.life_model_change_proposal_source as enum (
  'onboarding',
  'mentor'
);

create type public.life_model_change_proposal_status as enum (
  'pending',
  'accepted',
  'rejected',
  'superseded'
);

create type public.onboarding_session_status as enum (
  'in_progress',
  'completed',
  'abandoned'
);

create table public.onboarding_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  onboarding_version integer not null,
  status public.onboarding_session_status not null default 'in_progress',
  current_step text not null,
  user_draft jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  abandoned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint onboarding_sessions_id_user_id_key unique (id, user_id),
  constraint onboarding_sessions_version_positive check (onboarding_version >= 1),
  constraint onboarding_sessions_step_length check (
    char_length(btrim(current_step)) between 1 and 100
  ),
  constraint onboarding_sessions_user_draft_object check (
    jsonb_typeof(user_draft) = 'object'
  ),
  constraint onboarding_sessions_terminal_timestamps check (
    (
      status = 'in_progress'
      and completed_at is null
      and abandoned_at is null
    )
    or (
      status = 'completed'
      and completed_at is not null
      and abandoned_at is null
    )
    or (
      status = 'abandoned'
      and completed_at is null
      and abandoned_at is not null
    )
  )
);

create unique index onboarding_sessions_one_in_progress_per_user_key
  on public.onboarding_sessions (user_id)
  where status = 'in_progress';

create table public.life_model_change_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  proposal_source public.life_model_change_proposal_source not null,
  onboarding_session_id uuid,
  status public.life_model_change_proposal_status not null default 'pending',
  user_facing_summary text not null,
  proposed_changes jsonb not null,
  confirmation_result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  confirmed_at timestamptz,
  constraint life_model_change_proposals_id_user_id_key unique (id, user_id),
  constraint life_model_change_proposals_onboarding_owner_fkey
    foreign key (onboarding_session_id, user_id)
    references public.onboarding_sessions(id, user_id),
  constraint life_model_change_proposals_source_session_pair check (
    (proposal_source = 'onboarding') = (onboarding_session_id is not null)
  ),
  constraint life_model_change_proposals_summary_length check (
    char_length(btrim(user_facing_summary)) between 1 and 2000
  ),
  constraint life_model_change_proposals_changes_object check (
    jsonb_typeof(proposed_changes) = 'object'
  ),
  constraint life_model_change_proposals_result_object check (
    confirmation_result is null
    or jsonb_typeof(confirmation_result) = 'object'
  ),
  constraint life_model_change_proposals_resolution_state check (
    (
      status = 'pending'
      and resolved_at is null
      and confirmed_at is null
      and confirmation_result is null
    )
    or (
      status = 'accepted'
      and resolved_at is not null
      and confirmed_at is not null
      and confirmation_result is not null
    )
    or (
      status in ('rejected', 'superseded')
      and resolved_at is not null
      and confirmed_at is null
      and confirmation_result is null
    )
  )
);

create unique index life_model_change_proposals_pending_onboarding_key
  on public.life_model_change_proposals (onboarding_session_id)
  where status = 'pending' and onboarding_session_id is not null;

alter table public.life_areas
  add column source_proposal_id uuid,
  add constraint life_areas_proposal_owner_fkey
    foreign key (source_proposal_id, user_id)
    references public.life_model_change_proposals(id, user_id)
    not valid;

alter table public.life_area_current_states
  add constraint life_area_current_states_proposal_owner_fkey
    foreign key (source_proposal_id, user_id)
    references public.life_model_change_proposals(id, user_id)
    not valid;

alter table public.goals
  add constraint goals_proposal_owner_fkey
    foreign key (source_proposal_id, user_id)
    references public.life_model_change_proposals(id, user_id)
    not valid;

alter table public.goal_decisions
  add constraint goal_decisions_proposal_owner_fkey
    foreign key (source_proposal_id, user_id)
    references public.life_model_change_proposals(id, user_id)
    not valid;

alter table public.projects
  add constraint projects_proposal_owner_fkey
    foreign key (source_proposal_id, user_id)
    references public.life_model_change_proposals(id, user_id)
    not valid;

alter table public.routines
  add constraint routines_proposal_owner_fkey
    foreign key (source_proposal_id, user_id)
    references public.life_model_change_proposals(id, user_id)
    not valid;

alter table public.current_contexts
  add constraint current_contexts_proposal_owner_fkey
    foreign key (source_proposal_id, user_id)
    references public.life_model_change_proposals(id, user_id)
    not valid;

alter table public.life_evidence
  add constraint life_evidence_proposal_owner_fkey
    foreign key (source_proposal_id, user_id)
    references public.life_model_change_proposals(id, user_id)
    not valid;

create table public.life_area_desired_states (
  life_area_id uuid primary key,
  user_id uuid not null,
  summary text not null,
  target_start_date date,
  target_end_date date,
  target_confidence public.life_target_confidence,
  created_via public.life_model_provenance not null default 'user_stated',
  source_proposal_id uuid,
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint life_area_desired_states_owner_fkey
    foreign key (life_area_id, user_id)
    references public.life_areas(id, user_id)
    on delete cascade,
  constraint life_area_desired_states_proposal_owner_fkey
    foreign key (source_proposal_id, user_id)
    references public.life_model_change_proposals(id, user_id),
  constraint life_area_desired_states_summary_length check (
    char_length(btrim(summary)) between 1 and 5000
  ),
  constraint life_area_desired_states_target_window check (
    (
      target_start_date is null
      and target_end_date is null
      and target_confidence is null
    )
    or (
      target_start_date is not null
      and target_end_date is not null
      and target_confidence is not null
      and target_end_date >= target_start_date
    )
  ),
  constraint life_area_desired_states_proposal_source check (
    (created_via = 'ai_confirmed') = (source_proposal_id is not null)
  )
);

create table public.life_open_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  life_area_id uuid,
  question text not null,
  context text,
  status public.life_open_question_status not null default 'open',
  resolution_summary text,
  created_via public.life_model_provenance not null default 'user_stated',
  source_proposal_id uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint life_open_questions_id_user_id_key unique (id, user_id),
  constraint life_open_questions_area_owner_fkey
    foreign key (life_area_id, user_id)
    references public.life_areas(id, user_id),
  constraint life_open_questions_proposal_owner_fkey
    foreign key (source_proposal_id, user_id)
    references public.life_model_change_proposals(id, user_id),
  constraint life_open_questions_question_length check (
    char_length(btrim(question)) between 1 and 1000
  ),
  constraint life_open_questions_context_length check (
    context is null or char_length(btrim(context)) between 1 and 5000
  ),
  constraint life_open_questions_resolution_length check (
    resolution_summary is null
    or char_length(btrim(resolution_summary)) between 1 and 5000
  ),
  constraint life_open_questions_resolution_state check (
    (
      status = 'open'
      and resolved_at is null
      and resolution_summary is null
    )
    or (
      status = 'resolved'
      and resolved_at is not null
      and resolution_summary is not null
    )
    or (
      status = 'dismissed'
      and resolved_at is not null
    )
  ),
  constraint life_open_questions_proposal_source check (
    (created_via = 'ai_confirmed') = (source_proposal_id is not null)
  )
);

create index life_open_questions_user_area_status_idx
  on public.life_open_questions (user_id, life_area_id, status, created_at);

create table public.current_directions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  summary text not null,
  rationale text not null,
  started_on date not null,
  review_on date,
  created_via public.life_model_provenance not null default 'user_stated',
  source_proposal_id uuid,
  confirmed_at timestamptz not null default now(),
  superseded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint current_directions_id_user_id_key unique (id, user_id),
  constraint current_directions_proposal_owner_fkey
    foreign key (source_proposal_id, user_id)
    references public.life_model_change_proposals(id, user_id),
  constraint current_directions_summary_length check (
    char_length(btrim(summary)) between 1 and 2000
  ),
  constraint current_directions_rationale_length check (
    char_length(btrim(rationale)) between 1 and 5000
  ),
  constraint current_directions_review_date check (
    review_on is null or review_on >= started_on
  ),
  constraint current_directions_proposal_source check (
    (created_via = 'ai_confirmed') = (source_proposal_id is not null)
  )
);

create unique index current_directions_one_current_per_user_key
  on public.current_directions (user_id)
  where superseded_at is null;

create table public.current_direction_goals (
  user_id uuid not null,
  current_direction_id uuid not null,
  goal_id uuid not null,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  primary key (current_direction_id, goal_id),
  constraint current_direction_goals_direction_owner_fkey
    foreign key (current_direction_id, user_id)
    references public.current_directions(id, user_id)
    on delete cascade,
  constraint current_direction_goals_goal_owner_fkey
    foreign key (goal_id, user_id)
    references public.goals(id, user_id),
  constraint current_direction_goals_sort_nonnegative check (sort_order >= 0),
  constraint current_direction_goals_direction_sort_key
    unique (current_direction_id, sort_order)
);

create index current_direction_goals_user_goal_idx
  on public.current_direction_goals (user_id, goal_id);

create or replace function private.life_model_jsonb_has_only_keys(
  p_value jsonb,
  p_allowed_keys text[]
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if jsonb_typeof(p_value) <> 'object' then
    return false;
  end if;

  return not exists (
    select 1
    from jsonb_object_keys(p_value) as key_name
    where not (key_name = any(p_allowed_keys))
  );
end;
$$;

create or replace function private.assert_life_model_change_proposal_shape(
  p_proposed_changes jsonb
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_operation jsonb;
  v_operation_type text;
  v_operation_count integer;
  v_direction_count integer := 0;
  v_allowed_keys text[];
begin
  if not private.life_model_jsonb_has_only_keys(
    p_proposed_changes,
    array['operations']::text[]
  ) then
    raise exception 'Proposed changes may contain only an operations array';
  end if;

  if jsonb_typeof(p_proposed_changes -> 'operations') <> 'array' then
    raise exception 'Proposed changes operations must be an array';
  end if;

  v_operation_count := jsonb_array_length(p_proposed_changes -> 'operations');
  if v_operation_count < 1 or v_operation_count > 100 then
    raise exception 'A proposal must contain between 1 and 100 operations';
  end if;

  for v_operation in
    select value from jsonb_array_elements(p_proposed_changes -> 'operations')
  loop
    v_operation_type := v_operation ->> 'type';

    case v_operation_type
      when 'create_life_area' then
        v_allowed_keys := array['type', 'id', 'name', 'sort_order'];
      when 'set_current_state' then
        v_allowed_keys := array['type', 'life_area_id', 'summary', 'as_of_date'];
      when 'set_desired_state' then
        v_allowed_keys := array[
          'type', 'life_area_id', 'summary', 'target_start_date',
          'target_end_date', 'target_confidence'
        ];
      when 'create_goal' then
        v_allowed_keys := array[
          'type', 'id', 'life_area_id', 'title', 'desired_outcome', 'status',
          'target_start_date', 'target_end_date', 'target_confidence'
        ];
      when 'create_project' then
        v_allowed_keys := array[
          'type', 'id', 'life_area_id', 'goal_id', 'parent_project_id',
          'title', 'desired_outcome', 'status', 'target_start_date',
          'target_end_date', 'target_confidence'
        ];
      when 'create_routine' then
        v_allowed_keys := array[
          'type', 'id', 'life_area_id', 'goal_id', 'project_id', 'title',
          'status', 'cadence', 'cadence_count', 'weekdays',
          'estimated_minutes', 'preferred_time', 'skip_policy'
        ];
      when 'create_current_context' then
        v_allowed_keys := array[
          'type', 'id', 'life_area_id', 'title', 'planning_impact',
          'started_on', 'expected_end_start', 'expected_end_end'
        ];
      when 'create_open_question' then
        v_allowed_keys := array[
          'type', 'id', 'life_area_id', 'question', 'context'
        ];
      when 'set_current_direction' then
        v_allowed_keys := array[
          'type', 'id', 'summary', 'rationale', 'started_on', 'review_on',
          'goal_ids'
        ];
        v_direction_count := v_direction_count + 1;
      else
        raise exception 'Unsupported Life Model proposal operation: %',
          coalesce(v_operation_type, '<missing>');
    end case;

    if not private.life_model_jsonb_has_only_keys(v_operation, v_allowed_keys) then
      raise exception 'Proposal operation % contains unsupported fields',
        v_operation_type;
    end if;
  end loop;

  if v_direction_count > 1 then
    raise exception 'A proposal may set Current Direction at most once';
  end if;
end;
$$;

create or replace function private.enforce_confirmed_life_model_provenance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and new.created_via is not distinct from old.created_via
    and new.source_proposal_id is not distinct from old.source_proposal_id then
    return new;
  end if;

  if new.created_via = 'ai_confirmed' then
    if new.source_proposal_id is null then
      raise exception 'AI-confirmed Life Model data requires an accepted proposal';
    end if;

    perform 1
    from public.life_model_change_proposals
    where id = new.source_proposal_id
      and user_id = new.user_id
      and status = 'accepted';

    if not found then
      raise exception 'AI-confirmed Life Model data requires an accepted owned proposal';
    end if;
  elsif new.source_proposal_id is not null then
    raise exception 'Only AI-confirmed Life Model data may reference a proposal';
  end if;

  return new;
end;
$$;

create trigger life_areas_confirmed_provenance
before insert or update of created_via, source_proposal_id on public.life_areas
for each row execute function private.enforce_confirmed_life_model_provenance();

create trigger life_area_current_states_confirmed_provenance
before insert or update of created_via, source_proposal_id
on public.life_area_current_states
for each row execute function private.enforce_confirmed_life_model_provenance();

create trigger goals_confirmed_provenance
before insert or update of created_via, source_proposal_id on public.goals
for each row execute function private.enforce_confirmed_life_model_provenance();

create trigger goal_decisions_confirmed_provenance
before insert or update of created_via, source_proposal_id
on public.goal_decisions
for each row execute function private.enforce_confirmed_life_model_provenance();

create trigger projects_confirmed_provenance
before insert or update of created_via, source_proposal_id on public.projects
for each row execute function private.enforce_confirmed_life_model_provenance();

create trigger routines_confirmed_provenance
before insert or update of created_via, source_proposal_id on public.routines
for each row execute function private.enforce_confirmed_life_model_provenance();

create trigger current_contexts_confirmed_provenance
before insert or update of created_via, source_proposal_id on public.current_contexts
for each row execute function private.enforce_confirmed_life_model_provenance();

create trigger life_evidence_confirmed_provenance
before insert or update of created_via, source_proposal_id on public.life_evidence
for each row execute function private.enforce_confirmed_life_model_provenance();

create trigger life_area_desired_states_confirmed_provenance
before insert or update of created_via, source_proposal_id
on public.life_area_desired_states
for each row execute function private.enforce_confirmed_life_model_provenance();

create trigger life_open_questions_confirmed_provenance
before insert or update of created_via, source_proposal_id
on public.life_open_questions
for each row execute function private.enforce_confirmed_life_model_provenance();

create trigger current_directions_confirmed_provenance
before insert or update of created_via, source_proposal_id
on public.current_directions
for each row execute function private.enforce_confirmed_life_model_provenance();

create trigger onboarding_sessions_set_updated_at
before update on public.onboarding_sessions
for each row execute function public.set_updated_at();

create trigger life_model_change_proposals_set_updated_at
before update on public.life_model_change_proposals
for each row execute function public.set_updated_at();

create trigger life_area_desired_states_set_updated_at
before update on public.life_area_desired_states
for each row execute function public.set_updated_at();

create trigger life_open_questions_set_updated_at
before update on public.life_open_questions
for each row execute function public.set_updated_at();

create trigger current_directions_set_updated_at
before update on public.current_directions
for each row execute function public.set_updated_at();

alter table public.onboarding_sessions enable row level security;
alter table public.onboarding_sessions force row level security;
alter table public.life_model_change_proposals enable row level security;
alter table public.life_model_change_proposals force row level security;
alter table public.life_area_desired_states enable row level security;
alter table public.life_area_desired_states force row level security;
alter table public.life_open_questions enable row level security;
alter table public.life_open_questions force row level security;
alter table public.current_directions enable row level security;
alter table public.current_directions force row level security;
alter table public.current_direction_goals enable row level security;
alter table public.current_direction_goals force row level security;

create policy "Users can read their own onboarding sessions"
on public.onboarding_sessions for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can read their own Life Model proposals"
on public.life_model_change_proposals for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can read their own desired states"
on public.life_area_desired_states for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can read their own open questions"
on public.life_open_questions for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can read their own current directions"
on public.current_directions for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can read their own Current Direction goals"
on public.current_direction_goals for select to authenticated
using ((select auth.uid()) = user_id);

revoke all on table public.onboarding_sessions from public, anon, authenticated;
revoke all on table public.life_model_change_proposals from public, anon, authenticated;
revoke all on table public.life_area_desired_states from public, anon, authenticated;
revoke all on table public.life_open_questions from public, anon, authenticated;
revoke all on table public.current_directions from public, anon, authenticated;
revoke all on table public.current_direction_goals from public, anon, authenticated;

grant select on table public.onboarding_sessions to authenticated;
grant select on table public.life_model_change_proposals to authenticated;
grant select on table public.life_area_desired_states to authenticated;
grant select on table public.life_open_questions to authenticated;
grant select on table public.current_directions to authenticated;
grant select on table public.current_direction_goals to authenticated;

create function public.set_life_area_desired_state(
  p_life_area_id uuid,
  p_summary text,
  p_target_start_date date default null,
  p_target_end_date date default null,
  p_target_confidence public.life_target_confidence default null,
  p_created_via public.life_model_provenance default 'user_stated',
  p_source_proposal_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  perform 1
  from public.life_areas
  where id = p_life_area_id
    and user_id = v_user_id
    and status = 'active'
  for update;

  if not found then
    raise exception 'Active Life Area not found';
  end if;

  insert into public.life_area_desired_states (
    life_area_id,
    user_id,
    summary,
    target_start_date,
    target_end_date,
    target_confidence,
    created_via,
    source_proposal_id,
    confirmed_at
  )
  values (
    p_life_area_id,
    v_user_id,
    btrim(p_summary),
    p_target_start_date,
    p_target_end_date,
    p_target_confidence,
    p_created_via,
    p_source_proposal_id,
    clock_timestamp()
  )
  on conflict (life_area_id) do update
  set
    summary = excluded.summary,
    target_start_date = excluded.target_start_date,
    target_end_date = excluded.target_end_date,
    target_confidence = excluded.target_confidence,
    created_via = excluded.created_via,
    source_proposal_id = excluded.source_proposal_id,
    confirmed_at = excluded.confirmed_at;
end;
$$;

create function public.create_life_open_question(
  p_question text,
  p_life_area_id uuid default null,
  p_context text default null,
  p_created_via public.life_model_provenance default 'user_stated',
  p_source_proposal_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_question_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_life_area_id is not null and not exists (
    select 1
    from public.life_areas
    where id = p_life_area_id
      and user_id = v_user_id
      and status = 'active'
  ) then
    raise exception 'Active Life Area not found';
  end if;

  insert into public.life_open_questions (
    user_id,
    life_area_id,
    question,
    context,
    created_via,
    source_proposal_id
  )
  values (
    v_user_id,
    p_life_area_id,
    btrim(p_question),
    nullif(btrim(p_context), ''),
    p_created_via,
    p_source_proposal_id
  )
  returning id into v_question_id;

  return v_question_id;
end;
$$;

create function public.update_life_open_question(
  p_life_open_question_id uuid,
  p_question text,
  p_context text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_status public.life_open_question_status;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select status
  into v_status
  from public.life_open_questions
  where id = p_life_open_question_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Life Open Question not found';
  end if;

  if v_status <> 'open' then
    raise exception 'Resolved or dismissed Life Open Questions cannot be changed';
  end if;

  update public.life_open_questions
  set
    question = btrim(p_question),
    context = nullif(btrim(p_context), '')
  where id = p_life_open_question_id
    and user_id = v_user_id;
end;
$$;

create function public.transition_life_open_question(
  p_life_open_question_id uuid,
  p_new_status public.life_open_question_status,
  p_resolution_summary text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_status public.life_open_question_status;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select status
  into v_status
  from public.life_open_questions
  where id = p_life_open_question_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Life Open Question not found';
  end if;

  if v_status <> 'open' then
    raise exception 'Resolved or dismissed Life Open Questions cannot be reopened';
  end if;

  if p_new_status not in ('resolved', 'dismissed') then
    raise exception 'Life Open Questions may only be resolved or dismissed';
  end if;

  if p_new_status = 'resolved'
    and nullif(btrim(p_resolution_summary), '') is null then
    raise exception 'A resolution summary is required';
  end if;

  update public.life_open_questions
  set
    status = p_new_status,
    resolution_summary = case
      when p_new_status = 'resolved' then btrim(p_resolution_summary)
      else nullif(btrim(p_resolution_summary), '')
    end,
    resolved_at = clock_timestamp()
  where id = p_life_open_question_id
    and user_id = v_user_id;
end;
$$;

create function public.set_current_direction(
  p_summary text,
  p_rationale text,
  p_goal_ids uuid[],
  p_started_on date default null,
  p_review_on date default null,
  p_created_via public.life_model_provenance default 'user_stated',
  p_source_proposal_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_timezone text;
  v_started_on date;
  v_goal_count integer;
  v_owned_goal_count integer;
  v_direction_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_goal_ids is null or cardinality(p_goal_ids) = 0 then
    raise exception 'Current Direction requires at least one Goal';
  end if;

  if array_position(p_goal_ids, null) is not null then
    raise exception 'Current Direction Goal order cannot contain null IDs';
  end if;

  select count(distinct goal_id)
  into v_goal_count
  from unnest(p_goal_ids) as ordered(goal_id);

  if v_goal_count <> cardinality(p_goal_ids) then
    raise exception 'Current Direction Goal order cannot contain duplicate IDs';
  end if;

  select timezone
  into v_timezone
  from public.profiles
  where id = v_user_id;

  if v_timezone is null then
    raise exception 'Profile timezone not found';
  end if;

  v_started_on := coalesce(
    p_started_on,
    (clock_timestamp() at time zone v_timezone)::date
  );

  perform 1
  from public.goals
  where user_id = v_user_id
    and id = any(p_goal_ids)
  order by id
  for update;

  select count(*)
  into v_owned_goal_count
  from public.goals
  where user_id = v_user_id
    and id = any(p_goal_ids)
    and status in ('exploring', 'active')
    and archived_at is null;

  if v_owned_goal_count <> cardinality(p_goal_ids) then
    raise exception 'Current Direction Goals must be active, non-terminal, and owned';
  end if;

  perform 1
  from public.current_directions
  where user_id = v_user_id
    and superseded_at is null
  for update;

  update public.current_directions
  set superseded_at = clock_timestamp()
  where user_id = v_user_id
    and superseded_at is null;

  insert into public.current_directions (
    user_id,
    summary,
    rationale,
    started_on,
    review_on,
    created_via,
    source_proposal_id,
    confirmed_at
  )
  values (
    v_user_id,
    btrim(p_summary),
    btrim(p_rationale),
    v_started_on,
    p_review_on,
    p_created_via,
    p_source_proposal_id,
    clock_timestamp()
  )
  returning id into v_direction_id;

  insert into public.current_direction_goals (
    user_id,
    current_direction_id,
    goal_id,
    sort_order
  )
  select
    v_user_id,
    v_direction_id,
    ordered.goal_id,
    (ordered.ordinality - 1)::integer
  from unnest(p_goal_ids) with ordinality as ordered(goal_id, ordinality);

  return v_direction_id;
end;
$$;

create function public.supersede_current_direction()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  perform 1
  from public.current_directions
  where user_id = v_user_id
    and superseded_at is null
  for update;

  update public.current_directions
  set superseded_at = clock_timestamp()
  where user_id = v_user_id
    and superseded_at is null;
end;
$$;

create function public.save_onboarding_session(
  p_onboarding_version integer,
  p_current_step text,
  p_user_draft jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_onboarding_version < 1 then
    raise exception 'Onboarding version must be positive';
  end if;

  if jsonb_typeof(p_user_draft) <> 'object' then
    raise exception 'Onboarding user draft must be an object';
  end if;

  select id
  into v_session_id
  from public.onboarding_sessions
  where user_id = v_user_id
    and status = 'in_progress'
  for update;

  if found then
    update public.onboarding_sessions
    set
      onboarding_version = p_onboarding_version,
      current_step = btrim(p_current_step),
      user_draft = p_user_draft
    where id = v_session_id
      and user_id = v_user_id;
  else
    insert into public.onboarding_sessions (
      user_id,
      onboarding_version,
      current_step,
      user_draft
    )
    values (
      v_user_id,
      p_onboarding_version,
      btrim(p_current_step),
      p_user_draft
    )
    returning id into v_session_id;
  end if;

  return v_session_id;
end;
$$;

create function public.abandon_onboarding_session(
  p_onboarding_session_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_status public.onboarding_session_status;
  v_now timestamptz := clock_timestamp();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select status
  into v_status
  from public.onboarding_sessions
  where id = p_onboarding_session_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Onboarding session not found';
  end if;

  if v_status = 'completed' then
    raise exception 'Completed onboarding sessions cannot be abandoned';
  end if;

  if v_status = 'abandoned' then
    return;
  end if;

  update public.life_model_change_proposals
  set
    status = 'superseded',
    resolved_at = v_now
  where user_id = v_user_id
    and onboarding_session_id = p_onboarding_session_id
    and status = 'pending';

  update public.onboarding_sessions
  set
    status = 'abandoned',
    abandoned_at = v_now,
    user_draft = '{}'::jsonb
  where id = p_onboarding_session_id
    and user_id = v_user_id;
end;
$$;

create function public.create_life_model_change_proposal(
  p_proposal_source public.life_model_change_proposal_source,
  p_user_facing_summary text,
  p_proposed_changes jsonb,
  p_onboarding_session_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_proposal_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if (p_proposal_source = 'onboarding') <> (p_onboarding_session_id is not null) then
    raise exception 'Onboarding proposals require an Onboarding Session';
  end if;

  if p_onboarding_session_id is not null then
    perform 1
    from public.onboarding_sessions
    where id = p_onboarding_session_id
      and user_id = v_user_id
      and status = 'in_progress'
    for update;

    if not found then
      raise exception 'Active Onboarding Session not found';
    end if;
  end if;

  perform private.assert_life_model_change_proposal_shape(p_proposed_changes);

  update public.life_model_change_proposals
  set
    status = 'superseded',
    resolved_at = v_now
  where user_id = v_user_id
    and status = 'pending'
    and (
      onboarding_session_id is not distinct from p_onboarding_session_id
      and proposal_source = p_proposal_source
    );

  insert into public.life_model_change_proposals (
    user_id,
    proposal_source,
    onboarding_session_id,
    user_facing_summary,
    proposed_changes
  )
  values (
    v_user_id,
    p_proposal_source,
    p_onboarding_session_id,
    btrim(p_user_facing_summary),
    p_proposed_changes
  )
  returning id into v_proposal_id;

  return v_proposal_id;
end;
$$;

create function public.reject_life_model_change_proposal(
  p_life_model_change_proposal_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_status public.life_model_change_proposal_status;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select status
  into v_status
  from public.life_model_change_proposals
  where id = p_life_model_change_proposal_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Life Model Change Proposal not found';
  end if;

  if v_status = 'accepted' then
    raise exception 'Accepted Life Model Change Proposals cannot be rejected';
  end if;

  if v_status in ('rejected', 'superseded') then
    return;
  end if;

  update public.life_model_change_proposals
  set
    status = 'rejected',
    resolved_at = clock_timestamp()
  where id = p_life_model_change_proposal_id
    and user_id = v_user_id;
end;
$$;

create function public.confirm_life_model_change_proposal(
  p_life_model_change_proposal_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_proposal public.life_model_change_proposals%rowtype;
  v_session_status public.onboarding_session_status;
  v_operation jsonb;
  v_goal_ids uuid[];
  v_weekdays smallint[];
  v_owned_goal_count integer;
  v_now timestamptz := clock_timestamp();
  v_result jsonb;
  v_area_count integer := 0;
  v_current_state_count integer := 0;
  v_desired_state_count integer := 0;
  v_goal_count integer := 0;
  v_project_count integer := 0;
  v_routine_count integer := 0;
  v_context_count integer := 0;
  v_question_count integer := 0;
  v_direction_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_proposal
  from public.life_model_change_proposals
  where id = p_life_model_change_proposal_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Life Model Change Proposal not found';
  end if;

  if v_proposal.status = 'accepted' then
    return v_proposal.confirmation_result;
  end if;

  if v_proposal.status <> 'pending' then
    raise exception 'Only pending Life Model Change Proposals can be confirmed';
  end if;

  perform private.assert_life_model_change_proposal_shape(
    v_proposal.proposed_changes
  );

  if v_proposal.onboarding_session_id is not null then
    select status
    into v_session_status
    from public.onboarding_sessions
    where id = v_proposal.onboarding_session_id
      and user_id = v_user_id
    for update;

    if not found or v_session_status <> 'in_progress' then
      raise exception 'Active Onboarding Session not found';
    end if;
  end if;

  -- The proposal becomes accepted inside this transaction before canonical
  -- rows are written. Any later failure rolls the status and every write back.
  update public.life_model_change_proposals
  set
    status = 'accepted',
    resolved_at = v_now,
    confirmed_at = v_now,
    confirmation_result = '{}'::jsonb
  where id = v_proposal.id
    and user_id = v_user_id;

  -- Create Life Areas first so every later operation may reference them,
  -- regardless of the order used in the proposal payload.
  for v_operation in
    select value
    from jsonb_array_elements(v_proposal.proposed_changes -> 'operations')
    where value ->> 'type' = 'create_life_area'
  loop
    insert into public.life_areas (
      id,
      user_id,
      name,
      sort_order,
      created_via,
      source_proposal_id
    )
    values (
      (v_operation ->> 'id')::uuid,
      v_user_id,
      btrim(v_operation ->> 'name'),
      coalesce((v_operation ->> 'sort_order')::integer, 0),
      'ai_confirmed',
      v_proposal.id
    );
    v_area_count := v_area_count + 1;
  end loop;

  for v_operation in
    select value
    from jsonb_array_elements(v_proposal.proposed_changes -> 'operations')
    where value ->> 'type' = 'set_current_state'
  loop
    perform 1
    from public.life_areas
    where id = (v_operation ->> 'life_area_id')::uuid
      and user_id = v_user_id
      and status = 'active'
    for update;

    if not found then
      raise exception 'Active Life Area not found for Current State';
    end if;

    insert into public.life_area_current_states (
      life_area_id,
      user_id,
      summary,
      as_of_date,
      created_via,
      source_proposal_id,
      confirmed_at
    )
    values (
      (v_operation ->> 'life_area_id')::uuid,
      v_user_id,
      btrim(v_operation ->> 'summary'),
      (v_operation ->> 'as_of_date')::date,
      'ai_confirmed',
      v_proposal.id,
      v_now
    )
    on conflict (life_area_id) do update
    set
      summary = excluded.summary,
      as_of_date = excluded.as_of_date,
      created_via = excluded.created_via,
      source_proposal_id = excluded.source_proposal_id,
      confirmed_at = excluded.confirmed_at;
    v_current_state_count := v_current_state_count + 1;
  end loop;

  for v_operation in
    select value
    from jsonb_array_elements(v_proposal.proposed_changes -> 'operations')
    where value ->> 'type' = 'set_desired_state'
  loop
    perform 1
    from public.life_areas
    where id = (v_operation ->> 'life_area_id')::uuid
      and user_id = v_user_id
      and status = 'active'
    for update;

    if not found then
      raise exception 'Active Life Area not found for Desired State';
    end if;

    insert into public.life_area_desired_states (
      life_area_id,
      user_id,
      summary,
      target_start_date,
      target_end_date,
      target_confidence,
      created_via,
      source_proposal_id,
      confirmed_at
    )
    values (
      (v_operation ->> 'life_area_id')::uuid,
      v_user_id,
      btrim(v_operation ->> 'summary'),
      nullif(v_operation ->> 'target_start_date', '')::date,
      nullif(v_operation ->> 'target_end_date', '')::date,
      nullif(v_operation ->> 'target_confidence', '')::public.life_target_confidence,
      'ai_confirmed',
      v_proposal.id,
      v_now
    )
    on conflict (life_area_id) do update
    set
      summary = excluded.summary,
      target_start_date = excluded.target_start_date,
      target_end_date = excluded.target_end_date,
      target_confidence = excluded.target_confidence,
      created_via = excluded.created_via,
      source_proposal_id = excluded.source_proposal_id,
      confirmed_at = excluded.confirmed_at;
    v_desired_state_count := v_desired_state_count + 1;
  end loop;

  for v_operation in
    select value
    from jsonb_array_elements(v_proposal.proposed_changes -> 'operations')
    where value ->> 'type' = 'create_goal'
  loop
    if (v_operation ->> 'status') not in ('exploring', 'active') then
      raise exception 'Onboarding proposals may create only exploring or active Goals';
    end if;

    insert into public.goals (
      id,
      user_id,
      life_area_id,
      title,
      desired_outcome,
      status,
      target_start_date,
      target_end_date,
      target_confidence,
      created_via,
      source_proposal_id
    )
    values (
      (v_operation ->> 'id')::uuid,
      v_user_id,
      (v_operation ->> 'life_area_id')::uuid,
      btrim(v_operation ->> 'title'),
      btrim(v_operation ->> 'desired_outcome'),
      (v_operation ->> 'status')::public.goal_status,
      nullif(v_operation ->> 'target_start_date', '')::date,
      nullif(v_operation ->> 'target_end_date', '')::date,
      nullif(v_operation ->> 'target_confidence', '')::public.life_target_confidence,
      'ai_confirmed',
      v_proposal.id
    );
    v_goal_count := v_goal_count + 1;
  end loop;

  for v_operation in
    select value
    from jsonb_array_elements(v_proposal.proposed_changes -> 'operations')
    where value ->> 'type' = 'create_project'
  loop
    if (v_operation ->> 'status') not in ('planned', 'active', 'paused') then
      raise exception 'Onboarding proposals may create only non-terminal Projects';
    end if;

    insert into public.projects (
      id,
      user_id,
      life_area_id,
      goal_id,
      parent_project_id,
      title,
      desired_outcome,
      status,
      target_start_date,
      target_end_date,
      target_confidence,
      created_via,
      source_proposal_id
    )
    values (
      (v_operation ->> 'id')::uuid,
      v_user_id,
      (v_operation ->> 'life_area_id')::uuid,
      nullif(v_operation ->> 'goal_id', '')::uuid,
      nullif(v_operation ->> 'parent_project_id', '')::uuid,
      btrim(v_operation ->> 'title'),
      btrim(v_operation ->> 'desired_outcome'),
      (v_operation ->> 'status')::public.project_status,
      nullif(v_operation ->> 'target_start_date', '')::date,
      nullif(v_operation ->> 'target_end_date', '')::date,
      nullif(v_operation ->> 'target_confidence', '')::public.life_target_confidence,
      'ai_confirmed',
      v_proposal.id
    );
    v_project_count := v_project_count + 1;
  end loop;

  for v_operation in
    select value
    from jsonb_array_elements(v_proposal.proposed_changes -> 'operations')
    where value ->> 'type' = 'create_routine'
  loop
    if (v_operation ->> 'status') not in ('active', 'paused') then
      raise exception 'Onboarding proposals may create only active or paused Routines';
    end if;

    if coalesce(jsonb_typeof(v_operation -> 'weekdays'), 'array') <> 'array' then
      raise exception 'Routine weekdays must be an array';
    end if;

    v_weekdays := array(
      select item.value::smallint
      from jsonb_array_elements_text(
        coalesce(v_operation -> 'weekdays', '[]'::jsonb)
      ) as item(value)
    );

    insert into public.routines (
      id,
      user_id,
      life_area_id,
      goal_id,
      project_id,
      title,
      status,
      cadence,
      cadence_count,
      weekdays,
      estimated_minutes,
      preferred_time,
      skip_policy,
      created_via,
      source_proposal_id
    )
    values (
      (v_operation ->> 'id')::uuid,
      v_user_id,
      (v_operation ->> 'life_area_id')::uuid,
      nullif(v_operation ->> 'goal_id', '')::uuid,
      nullif(v_operation ->> 'project_id', '')::uuid,
      btrim(v_operation ->> 'title'),
      (v_operation ->> 'status')::public.routine_status,
      (v_operation ->> 'cadence')::public.routine_cadence,
      nullif(v_operation ->> 'cadence_count', '')::smallint,
      v_weekdays,
      (v_operation ->> 'estimated_minutes')::integer,
      nullif(v_operation ->> 'preferred_time', '')::time,
      coalesce(
        nullif(v_operation ->> 'skip_policy', '')::public.routine_skip_policy,
        'skip'::public.routine_skip_policy
      ),
      'ai_confirmed',
      v_proposal.id
    );
    v_routine_count := v_routine_count + 1;
  end loop;

  for v_operation in
    select value
    from jsonb_array_elements(v_proposal.proposed_changes -> 'operations')
    where value ->> 'type' = 'create_current_context'
  loop
    insert into public.current_contexts (
      id,
      user_id,
      life_area_id,
      title,
      planning_impact,
      started_on,
      expected_end_start,
      expected_end_end,
      created_via,
      source_proposal_id
    )
    values (
      (v_operation ->> 'id')::uuid,
      v_user_id,
      (v_operation ->> 'life_area_id')::uuid,
      btrim(v_operation ->> 'title'),
      btrim(v_operation ->> 'planning_impact'),
      (v_operation ->> 'started_on')::date,
      nullif(v_operation ->> 'expected_end_start', '')::date,
      nullif(v_operation ->> 'expected_end_end', '')::date,
      'ai_confirmed',
      v_proposal.id
    );
    v_context_count := v_context_count + 1;
  end loop;

  for v_operation in
    select value
    from jsonb_array_elements(v_proposal.proposed_changes -> 'operations')
    where value ->> 'type' = 'create_open_question'
  loop
    insert into public.life_open_questions (
      id,
      user_id,
      life_area_id,
      question,
      context,
      created_via,
      source_proposal_id
    )
    values (
      (v_operation ->> 'id')::uuid,
      v_user_id,
      nullif(v_operation ->> 'life_area_id', '')::uuid,
      btrim(v_operation ->> 'question'),
      nullif(btrim(v_operation ->> 'context'), ''),
      'ai_confirmed',
      v_proposal.id
    );
    v_question_count := v_question_count + 1;
  end loop;

  for v_operation in
    select value
    from jsonb_array_elements(v_proposal.proposed_changes -> 'operations')
    where value ->> 'type' = 'set_current_direction'
  loop
    if jsonb_typeof(v_operation -> 'goal_ids') <> 'array' then
      raise exception 'Current Direction goal_ids must be an array';
    end if;

    v_goal_ids := array(
      select item.value::uuid
      from jsonb_array_elements_text(v_operation -> 'goal_ids') as item(value)
    );

    if cardinality(v_goal_ids) = 0
      or cardinality(v_goal_ids) <> (
        select count(distinct goal_id)
        from unnest(v_goal_ids) as ordered(goal_id)
      ) then
      raise exception 'Current Direction requires unique ordered Goals';
    end if;

    perform 1
    from public.goals
    where user_id = v_user_id
      and id = any(v_goal_ids)
    order by id
    for update;

    select count(*)
    into v_owned_goal_count
    from public.goals
    where user_id = v_user_id
      and id = any(v_goal_ids)
      and status in ('exploring', 'active')
      and archived_at is null;

    if v_owned_goal_count <> cardinality(v_goal_ids) then
      raise exception 'Current Direction Goals must be active, non-terminal, and owned';
    end if;

    perform 1
    from public.current_directions
    where user_id = v_user_id
      and superseded_at is null
    for update;

    update public.current_directions
    set superseded_at = v_now
    where user_id = v_user_id
      and superseded_at is null;

    insert into public.current_directions (
      id,
      user_id,
      summary,
      rationale,
      started_on,
      review_on,
      created_via,
      source_proposal_id,
      confirmed_at
    )
    values (
      (v_operation ->> 'id')::uuid,
      v_user_id,
      btrim(v_operation ->> 'summary'),
      btrim(v_operation ->> 'rationale'),
      (v_operation ->> 'started_on')::date,
      nullif(v_operation ->> 'review_on', '')::date,
      'ai_confirmed',
      v_proposal.id,
      v_now
    );

    insert into public.current_direction_goals (
      user_id,
      current_direction_id,
      goal_id,
      sort_order
    )
    select
      v_user_id,
      (v_operation ->> 'id')::uuid,
      ordered.goal_id,
      (ordered.ordinality - 1)::integer
    from unnest(v_goal_ids) with ordinality as ordered(goal_id, ordinality);
    v_direction_count := v_direction_count + 1;
  end loop;

  if v_proposal.onboarding_session_id is not null then
    update public.onboarding_sessions
    set
      status = 'completed',
      current_step = 'completed',
      user_draft = '{}'::jsonb,
      completed_at = v_now
    where id = v_proposal.onboarding_session_id
      and user_id = v_user_id;

    update public.profiles
    set onboarding_completed = true
    where id = v_user_id;
  end if;

  v_result := jsonb_build_object(
    'lifeAreasCreated', v_area_count,
    'currentStatesSet', v_current_state_count,
    'desiredStatesSet', v_desired_state_count,
    'goalsCreated', v_goal_count,
    'projectsCreated', v_project_count,
    'routinesCreated', v_routine_count,
    'currentContextsCreated', v_context_count,
    'openQuestionsCreated', v_question_count,
    'currentDirectionsSet', v_direction_count
  );

  update public.life_model_change_proposals
  set confirmation_result = v_result
  where id = v_proposal.id
    and user_id = v_user_id;

  return v_result;
end;
$$;

create or replace function public.archive_life_area(
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

  if exists (
    select 1
    from public.life_open_questions
    where user_id = v_user_id
      and life_area_id = p_life_area_id
      and status = 'open'
  ) then
    raise exception 'Resolve or dismiss open questions before archiving this Life Area';
  end if;

  update public.life_areas
  set
    status = 'archived',
    archived_at = clock_timestamp()
  where id = p_life_area_id
    and user_id = v_user_id;
end;
$$;

create or replace function public.get_life_model()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select jsonb_build_object(
    'areas', coalesce((
      select jsonb_agg(
        to_jsonb(area) - 'user_id' || jsonb_build_object(
          'currentState', (
            select to_jsonb(state) - 'user_id' - 'life_area_id'
            from public.life_area_current_states as state
            where state.life_area_id = area.id
              and state.user_id = v_user_id
          ),
          'desiredState', (
            select to_jsonb(desired_state) - 'user_id' - 'life_area_id'
            from public.life_area_desired_states as desired_state
            where desired_state.life_area_id = area.id
              and desired_state.user_id = v_user_id
          ),
          'goals', coalesce((
            select jsonb_agg(
              to_jsonb(goal_row) - 'user_id' || jsonb_build_object(
                'decisions', coalesce((
                  select jsonb_agg(
                    to_jsonb(decision_row) - 'user_id'
                    order by decision_row.decided_at desc, decision_row.created_at desc
                  )
                  from public.goal_decisions as decision_row
                  where decision_row.user_id = v_user_id
                    and decision_row.goal_id = goal_row.id
                ), '[]'::jsonb)
              )
              order by goal_row.created_at
            )
            from public.goals as goal_row
            where goal_row.user_id = v_user_id
              and goal_row.life_area_id = area.id
              and goal_row.status in ('exploring', 'active')
              and goal_row.archived_at is null
          ), '[]'::jsonb),
          'projects', coalesce((
            select jsonb_agg(to_jsonb(project_row) - 'user_id' order by project_row.created_at)
            from public.projects as project_row
            where project_row.user_id = v_user_id
              and project_row.life_area_id = area.id
              and project_row.status in ('planned', 'active', 'paused')
              and project_row.archived_at is null
          ), '[]'::jsonb),
          'routines', coalesce((
            select jsonb_agg(to_jsonb(routine_row) - 'user_id' order by routine_row.created_at)
            from public.routines as routine_row
            where routine_row.user_id = v_user_id
              and routine_row.life_area_id = area.id
              and routine_row.status in ('active', 'paused')
          ), '[]'::jsonb),
          'currentContexts', coalesce((
            select jsonb_agg(to_jsonb(context_row) - 'user_id' order by context_row.started_on)
            from public.current_contexts as context_row
            where context_row.user_id = v_user_id
              and context_row.life_area_id = area.id
              and context_row.status = 'active'
          ), '[]'::jsonb),
          'openQuestions', coalesce((
            select jsonb_agg(to_jsonb(question_row) - 'user_id' order by question_row.created_at)
            from public.life_open_questions as question_row
            where question_row.user_id = v_user_id
              and question_row.life_area_id = area.id
              and question_row.status = 'open'
          ), '[]'::jsonb),
          'evidence', coalesce((
            select jsonb_agg(
              to_jsonb(evidence_row) - 'user_id'
              order by evidence_row.occurred_on desc, evidence_row.created_at desc
            )
            from public.life_evidence as evidence_row
            where evidence_row.user_id = v_user_id
              and evidence_row.life_area_id = area.id
              and evidence_row.archived_at is null
          ), '[]'::jsonb)
        )
        order by area.sort_order, area.created_at
      )
      from public.life_areas as area
      where area.user_id = v_user_id
        and area.status = 'active'
    ), '[]'::jsonb),
    'openQuestions', coalesce((
      select jsonb_agg(to_jsonb(question_row) - 'user_id' order by question_row.created_at)
      from public.life_open_questions as question_row
      where question_row.user_id = v_user_id
        and question_row.life_area_id is null
        and question_row.status = 'open'
    ), '[]'::jsonb),
    'currentDirection', (
      select
        to_jsonb(direction_row) - 'user_id' || jsonb_build_object(
          'goals', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'goalId', direction_goal.goal_id,
                'sortOrder', direction_goal.sort_order,
                'lifeAreaId', goal_row.life_area_id,
                'title', goal_row.title,
                'status', goal_row.status
              )
              order by direction_goal.sort_order
            )
            from public.current_direction_goals as direction_goal
            join public.goals as goal_row
              on goal_row.id = direction_goal.goal_id
              and goal_row.user_id = v_user_id
            where direction_goal.user_id = v_user_id
              and direction_goal.current_direction_id = direction_row.id
          ), '[]'::jsonb)
        )
      from public.current_directions as direction_row
      where direction_row.user_id = v_user_id
        and direction_row.superseded_at is null
    ),
    'relationships', jsonb_build_object(
      'dailyActions', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'dailyActionId', action.id,
            'lifeAreaId', action.life_area_id,
            'goalId', action.goal_id,
            'projectId', action.project_id,
            'sourceRoutineId', action.source_routine_id,
            'sourceCalendarCommitmentId', action.source_calendar_commitment_id,
            'relationshipSource', action.relationship_source,
            'currentContextIds', coalesce((
              select jsonb_agg(link.current_context_id order by link.current_context_id)
              from public.daily_action_current_contexts as link
              where link.user_id = v_user_id
                and link.daily_action_id = action.id
            ), '[]'::jsonb)
          )
          order by action.created_at
        )
        from public.daily_actions as action
        where action.user_id = v_user_id
          and (
            action.life_area_id is not null
            or action.goal_id is not null
            or action.project_id is not null
            or action.source_routine_id is not null
            or action.source_calendar_commitment_id is not null
            or exists (
              select 1
              from public.daily_action_current_contexts as link
              where link.user_id = v_user_id
                and link.daily_action_id = action.id
            )
          )
      ), '[]'::jsonb),
      'calendarCommitments', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'calendarCommitmentId', commitment.id,
            'lifeAreaId', commitment.life_area_id,
            'goalId', commitment.goal_id,
            'projectId', commitment.project_id,
            'currentContextId', commitment.current_context_id,
            'relationshipSource', commitment.relationship_source
          )
          order by commitment.created_at
        )
        from public.calendar_commitments as commitment
        where commitment.user_id = v_user_id
          and num_nonnulls(
            commitment.life_area_id,
            commitment.goal_id,
            commitment.project_id,
            commitment.current_context_id
          ) > 0
      ), '[]'::jsonb)
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.set_life_area_desired_state(
  uuid,
  text,
  date,
  date,
  public.life_target_confidence,
  public.life_model_provenance,
  uuid
) from public, anon, authenticated;
revoke all on function public.create_life_open_question(
  text,
  uuid,
  text,
  public.life_model_provenance,
  uuid
) from public, anon, authenticated;
revoke all on function public.update_life_open_question(uuid, text, text)
from public, anon, authenticated;
revoke all on function public.transition_life_open_question(
  uuid,
  public.life_open_question_status,
  text
) from public, anon, authenticated;
revoke all on function public.set_current_direction(
  text,
  text,
  uuid[],
  date,
  date,
  public.life_model_provenance,
  uuid
) from public, anon, authenticated;
revoke all on function public.supersede_current_direction()
from public, anon, authenticated;
revoke all on function public.save_onboarding_session(integer, text, jsonb)
from public, anon, authenticated;
revoke all on function public.abandon_onboarding_session(uuid)
from public, anon, authenticated;
revoke all on function public.create_life_model_change_proposal(
  public.life_model_change_proposal_source,
  text,
  jsonb,
  uuid
) from public, anon, authenticated;
revoke all on function public.reject_life_model_change_proposal(uuid)
from public, anon, authenticated;
revoke all on function public.confirm_life_model_change_proposal(uuid)
from public, anon, authenticated;

grant execute on function public.set_life_area_desired_state(
  uuid,
  text,
  date,
  date,
  public.life_target_confidence,
  public.life_model_provenance,
  uuid
) to authenticated;
grant execute on function public.create_life_open_question(
  text,
  uuid,
  text,
  public.life_model_provenance,
  uuid
) to authenticated;
grant execute on function public.update_life_open_question(uuid, text, text)
to authenticated;
grant execute on function public.transition_life_open_question(
  uuid,
  public.life_open_question_status,
  text
) to authenticated;
grant execute on function public.set_current_direction(
  text,
  text,
  uuid[],
  date,
  date,
  public.life_model_provenance,
  uuid
) to authenticated;
grant execute on function public.supersede_current_direction()
to authenticated;
grant execute on function public.save_onboarding_session(integer, text, jsonb)
to authenticated;
grant execute on function public.abandon_onboarding_session(uuid)
to authenticated;
grant execute on function public.create_life_model_change_proposal(
  public.life_model_change_proposal_source,
  text,
  jsonb,
  uuid
) to authenticated;
grant execute on function public.reject_life_model_change_proposal(uuid)
to authenticated;
grant execute on function public.confirm_life_model_change_proposal(uuid)
to authenticated;

notify pgrst, 'reload schema';
