create type public.life_model_provenance as enum (
  'user_stated',
  'ai_confirmed',
  'system_derived'
);

create type public.life_area_status as enum ('active', 'archived');
create type public.goal_status as enum (
  'exploring',
  'active',
  'achieved',
  'abandoned'
);
create type public.life_target_confidence as enum ('estimated', 'aspirational');
create type public.goal_decision_type as enum (
  'explored',
  'committed',
  'changed',
  'achieved',
  'abandoned',
  'replaced'
);
create type public.project_status as enum (
  'planned',
  'active',
  'paused',
  'completed',
  'cancelled'
);
create type public.routine_status as enum ('active', 'paused', 'ended');
create type public.routine_cadence as enum (
  'daily',
  'weekly',
  'times_per_week',
  'certain_days'
);
create type public.routine_skip_policy as enum ('skip', 'offer_makeup');
create type public.current_context_status as enum ('active', 'ended');
create type public.life_evidence_signal as enum (
  'supports',
  'challenges',
  'neutral'
);

create table public.life_areas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  status public.life_area_status not null default 'active',
  sort_order integer not null default 0,
  created_via public.life_model_provenance not null default 'user_stated',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint life_areas_id_user_id_key unique (id, user_id),
  constraint life_areas_name_length check (
    char_length(btrim(name)) between 1 and 100
  ),
  constraint life_areas_sort_order_nonnegative check (sort_order >= 0),
  constraint life_areas_archive_state check (
    (status = 'archived') = (archived_at is not null)
  )
);

create unique index life_areas_user_name_active_key
  on public.life_areas (user_id, lower(btrim(name)))
  where status = 'active';

create index life_areas_user_order_idx
  on public.life_areas (user_id, status, sort_order, created_at);

create table public.life_area_current_states (
  life_area_id uuid primary key,
  user_id uuid not null,
  summary text not null,
  as_of_date date not null,
  created_via public.life_model_provenance not null default 'user_stated',
  source_proposal_id uuid,
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint life_area_current_states_owner_fkey
    foreign key (life_area_id, user_id)
    references public.life_areas(id, user_id)
    on delete cascade,
  constraint life_area_current_states_summary_length check (
    char_length(btrim(summary)) between 1 and 5000
  ),
  constraint life_area_current_states_proposal_source check (
    (created_via = 'ai_confirmed') = (source_proposal_id is not null)
  )
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  life_area_id uuid not null,
  title text not null,
  desired_outcome text not null,
  status public.goal_status not null default 'exploring',
  target_start_date date,
  target_end_date date,
  target_confidence public.life_target_confidence,
  replaced_by_goal_id uuid,
  created_via public.life_model_provenance not null default 'user_stated',
  source_proposal_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint goals_id_user_id_key unique (id, user_id),
  constraint goals_area_owner_fkey
    foreign key (life_area_id, user_id)
    references public.life_areas(id, user_id),
  constraint goals_replacement_owner_fkey
    foreign key (replaced_by_goal_id, user_id)
    references public.goals(id, user_id),
  constraint goals_title_length check (
    char_length(btrim(title)) between 1 and 200
  ),
  constraint goals_outcome_length check (
    char_length(btrim(desired_outcome)) between 1 and 2000
  ),
  constraint goals_target_window check (
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
  constraint goals_replacement_state check (
    replaced_by_goal_id is null
    or (status = 'abandoned' and replaced_by_goal_id <> id)
  ),
  constraint goals_proposal_source check (
    (created_via = 'ai_confirmed') = (source_proposal_id is not null)
  )
);

create index goals_user_area_status_idx
  on public.goals (user_id, life_area_id, status)
  where archived_at is null;

create table public.goal_decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  goal_id uuid not null,
  decision_type public.goal_decision_type not null,
  rationale text not null,
  evidence_summary text,
  consequence_summary text,
  replacement_goal_id uuid,
  created_via public.life_model_provenance not null default 'user_stated',
  source_proposal_id uuid,
  decided_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint goal_decisions_goal_owner_fkey
    foreign key (goal_id, user_id)
    references public.goals(id, user_id)
    on delete cascade,
  constraint goal_decisions_replacement_owner_fkey
    foreign key (replacement_goal_id, user_id)
    references public.goals(id, user_id),
  constraint goal_decisions_rationale_length check (
    char_length(btrim(rationale)) between 1 and 5000
  ),
  constraint goal_decisions_evidence_length check (
    evidence_summary is null or char_length(btrim(evidence_summary)) between 1 and 5000
  ),
  constraint goal_decisions_consequence_length check (
    consequence_summary is null
    or char_length(btrim(consequence_summary)) between 1 and 5000
  ),
  constraint goal_decisions_replacement_pair check (
    (decision_type = 'replaced') = (replacement_goal_id is not null)
  ),
  constraint goal_decisions_proposal_source check (
    (created_via = 'ai_confirmed') = (source_proposal_id is not null)
  )
);

create index goal_decisions_goal_decided_idx
  on public.goal_decisions (goal_id, decided_at desc, created_at desc);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  life_area_id uuid not null,
  goal_id uuid,
  parent_project_id uuid,
  title text not null,
  desired_outcome text not null,
  status public.project_status not null default 'planned',
  target_start_date date,
  target_end_date date,
  target_confidence public.life_target_confidence,
  replaced_by_project_id uuid,
  created_via public.life_model_provenance not null default 'user_stated',
  source_proposal_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint projects_id_user_id_key unique (id, user_id),
  constraint projects_area_owner_fkey
    foreign key (life_area_id, user_id)
    references public.life_areas(id, user_id),
  constraint projects_goal_owner_fkey
    foreign key (goal_id, user_id)
    references public.goals(id, user_id),
  constraint projects_parent_owner_fkey
    foreign key (parent_project_id, user_id)
    references public.projects(id, user_id),
  constraint projects_replacement_owner_fkey
    foreign key (replaced_by_project_id, user_id)
    references public.projects(id, user_id),
  constraint projects_title_length check (
    char_length(btrim(title)) between 1 and 200
  ),
  constraint projects_outcome_length check (
    char_length(btrim(desired_outcome)) between 1 and 2000
  ),
  constraint projects_target_window check (
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
  constraint projects_no_self_parent check (
    parent_project_id is null or parent_project_id <> id
  ),
  constraint projects_replacement_state check (
    replaced_by_project_id is null
    or (status = 'cancelled' and replaced_by_project_id <> id)
  ),
  constraint projects_proposal_source check (
    (created_via = 'ai_confirmed') = (source_proposal_id is not null)
  )
);

create index projects_user_area_status_idx
  on public.projects (user_id, life_area_id, status)
  where archived_at is null;

create index projects_goal_idx
  on public.projects (goal_id, status)
  where goal_id is not null and archived_at is null;

create table public.routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  life_area_id uuid not null,
  goal_id uuid,
  project_id uuid,
  title text not null,
  status public.routine_status not null default 'active',
  cadence public.routine_cadence not null,
  cadence_count smallint,
  weekdays smallint[] not null default '{}',
  estimated_minutes integer not null,
  preferred_time time without time zone,
  skip_policy public.routine_skip_policy not null default 'skip',
  created_via public.life_model_provenance not null default 'user_stated',
  source_proposal_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ended_at timestamptz,
  constraint routines_id_user_id_key unique (id, user_id),
  constraint routines_area_owner_fkey
    foreign key (life_area_id, user_id)
    references public.life_areas(id, user_id),
  constraint routines_goal_owner_fkey
    foreign key (goal_id, user_id)
    references public.goals(id, user_id),
  constraint routines_project_owner_fkey
    foreign key (project_id, user_id)
    references public.projects(id, user_id),
  constraint routines_title_length check (
    char_length(btrim(title)) between 1 and 200
  ),
  constraint routines_duration_range check (
    estimated_minutes between 1 and 1440
  ),
  constraint routines_weekdays check (
    weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]
    and cardinality(weekdays) <= 7
  ),
  constraint routines_cadence_shape check (
    (
      cadence = 'times_per_week'
      and cadence_count between 1 and 7
      and cardinality(weekdays) = 0
    )
    or (
      cadence = 'certain_days'
      and cadence_count is null
      and cardinality(weekdays) between 1 and 7
    )
    or (
      cadence in ('daily', 'weekly')
      and cadence_count is null
      and cardinality(weekdays) = 0
    )
  ),
  constraint routines_ended_state check (
    (status = 'ended') = (ended_at is not null)
  ),
  constraint routines_proposal_source check (
    (created_via = 'ai_confirmed') = (source_proposal_id is not null)
  )
);

create index routines_user_area_status_idx
  on public.routines (user_id, life_area_id, status);

create table public.current_contexts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  life_area_id uuid not null,
  title text not null,
  planning_impact text not null,
  status public.current_context_status not null default 'active',
  started_on date not null,
  expected_end_start date,
  expected_end_end date,
  ended_on date,
  created_via public.life_model_provenance not null default 'user_stated',
  source_proposal_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint current_contexts_id_user_id_key unique (id, user_id),
  constraint current_contexts_area_owner_fkey
    foreign key (life_area_id, user_id)
    references public.life_areas(id, user_id),
  constraint current_contexts_title_length check (
    char_length(btrim(title)) between 1 and 200
  ),
  constraint current_contexts_impact_length check (
    char_length(btrim(planning_impact)) between 1 and 5000
  ),
  constraint current_contexts_expected_window check (
    (
      expected_end_start is null
      and expected_end_end is null
    )
    or (
      expected_end_start is not null
      and expected_end_end is not null
      and expected_end_end >= expected_end_start
    )
  ),
  constraint current_contexts_ended_state check (
    (status = 'ended') = (ended_on is not null)
  ),
  constraint current_contexts_end_after_start check (
    ended_on is null or ended_on >= started_on
  ),
  constraint current_contexts_proposal_source check (
    (created_via = 'ai_confirmed') = (source_proposal_id is not null)
  )
);

create index current_contexts_user_area_status_idx
  on public.current_contexts (user_id, life_area_id, status);

alter table public.calendar_commitment_occurrences
  add constraint calendar_commitment_occurrences_id_user_id_key
  unique (id, user_id);

alter table public.day_corrections
  add constraint day_corrections_id_user_id_key unique (id, user_id);

create table public.life_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  life_area_id uuid not null,
  goal_id uuid,
  project_id uuid,
  summary text not null,
  occurred_on date not null,
  signal public.life_evidence_signal not null default 'neutral',
  source_daily_action_id uuid,
  source_calendar_occurrence_id uuid,
  source_day_correction_id uuid,
  created_via public.life_model_provenance not null default 'user_stated',
  source_proposal_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint life_evidence_id_user_id_key unique (id, user_id),
  constraint life_evidence_area_owner_fkey
    foreign key (life_area_id, user_id)
    references public.life_areas(id, user_id),
  constraint life_evidence_goal_owner_fkey
    foreign key (goal_id, user_id)
    references public.goals(id, user_id),
  constraint life_evidence_project_owner_fkey
    foreign key (project_id, user_id)
    references public.projects(id, user_id),
  constraint life_evidence_action_source_owner_fkey
    foreign key (source_daily_action_id, user_id)
    references public.daily_actions(id, user_id),
  constraint life_evidence_calendar_source_owner_fkey
    foreign key (source_calendar_occurrence_id, user_id)
    references public.calendar_commitment_occurrences(id, user_id),
  constraint life_evidence_correction_source_owner_fkey
    foreign key (source_day_correction_id, user_id)
    references public.day_corrections(id, user_id),
  constraint life_evidence_summary_length check (
    char_length(btrim(summary)) between 1 and 5000
  ),
  constraint life_evidence_single_raw_source check (
    num_nonnulls(
      source_daily_action_id,
      source_calendar_occurrence_id,
      source_day_correction_id
    ) <= 1
  ),
  constraint life_evidence_proposal_source check (
    (created_via = 'ai_confirmed') = (source_proposal_id is not null)
  )
);

create index life_evidence_user_area_occurred_idx
  on public.life_evidence (user_id, life_area_id, occurred_on desc)
  where archived_at is null;

create index life_evidence_goal_idx
  on public.life_evidence (goal_id, occurred_on desc)
  where goal_id is not null and archived_at is null;

create index life_evidence_project_idx
  on public.life_evidence (project_id, occurred_on desc)
  where project_id is not null and archived_at is null;

alter table public.daily_actions
  add column life_area_id uuid,
  add column goal_id uuid,
  add column project_id uuid,
  add column source_routine_id uuid,
  add column source_calendar_commitment_id uuid,
  add column relationship_source public.life_model_provenance,
  add constraint daily_actions_life_area_owner_fkey
    foreign key (life_area_id, user_id)
    references public.life_areas(id, user_id),
  add constraint daily_actions_goal_owner_fkey
    foreign key (goal_id, user_id)
    references public.goals(id, user_id),
  add constraint daily_actions_project_owner_fkey
    foreign key (project_id, user_id)
    references public.projects(id, user_id),
  add constraint daily_actions_routine_owner_fkey
    foreign key (source_routine_id, user_id)
    references public.routines(id, user_id),
  add constraint daily_actions_calendar_owner_fkey
    foreign key (source_calendar_commitment_id, user_id)
    references public.calendar_commitments(id, user_id),
  add constraint daily_actions_relationship_source_pair check (
    (
      life_area_id is null
      and goal_id is null
      and project_id is null
      and source_routine_id is null
      and source_calendar_commitment_id is null
      and relationship_source is null
    )
    or (
      num_nonnulls(
        life_area_id,
        goal_id,
        project_id,
        source_routine_id,
        source_calendar_commitment_id
      ) > 0
      and relationship_source is not null
    )
  );

create index daily_actions_life_relationships_idx
  on public.daily_actions (user_id, life_area_id, goal_id, project_id);

create index daily_actions_source_routine_idx
  on public.daily_actions (source_routine_id, daily_plan_id)
  where source_routine_id is not null;

create table public.daily_action_current_contexts (
  user_id uuid not null,
  daily_action_id uuid not null,
  current_context_id uuid not null,
  relationship_source public.life_model_provenance not null,
  created_at timestamptz not null default now(),
  primary key (daily_action_id, current_context_id),
  constraint daily_action_contexts_action_owner_fkey
    foreign key (daily_action_id, user_id)
    references public.daily_actions(id, user_id)
    on delete cascade,
  constraint daily_action_contexts_context_owner_fkey
    foreign key (current_context_id, user_id)
    references public.current_contexts(id, user_id)
    on delete cascade
);

create index daily_action_contexts_user_context_idx
  on public.daily_action_current_contexts (user_id, current_context_id);

alter table public.calendar_commitments
  add column life_area_id uuid,
  add column goal_id uuid,
  add column project_id uuid,
  add column current_context_id uuid,
  add column relationship_source public.life_model_provenance,
  add constraint calendar_commitments_life_area_owner_fkey
    foreign key (life_area_id, user_id)
    references public.life_areas(id, user_id),
  add constraint calendar_commitments_goal_owner_fkey
    foreign key (goal_id, user_id)
    references public.goals(id, user_id),
  add constraint calendar_commitments_project_owner_fkey
    foreign key (project_id, user_id)
    references public.projects(id, user_id),
  add constraint calendar_commitments_context_owner_fkey
    foreign key (current_context_id, user_id)
    references public.current_contexts(id, user_id),
  add constraint calendar_commitments_relationship_source_pair check (
    (
      life_area_id is null
      and goal_id is null
      and project_id is null
      and current_context_id is null
      and relationship_source is null
    )
    or (
      num_nonnulls(life_area_id, goal_id, project_id, current_context_id) > 0
      and relationship_source is not null
    )
  );

create index calendar_commitments_life_relationships_idx
  on public.calendar_commitments (user_id, life_area_id, goal_id, project_id);

create trigger life_areas_set_updated_at
before update on public.life_areas
for each row execute function public.set_updated_at();

create trigger life_area_current_states_set_updated_at
before update on public.life_area_current_states
for each row execute function public.set_updated_at();

create trigger goals_set_updated_at
before update on public.goals
for each row execute function public.set_updated_at();

create trigger projects_set_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

create trigger routines_set_updated_at
before update on public.routines
for each row execute function public.set_updated_at();

create trigger current_contexts_set_updated_at
before update on public.current_contexts
for each row execute function public.set_updated_at();

create trigger life_evidence_set_updated_at
before update on public.life_evidence
for each row execute function public.set_updated_at();

alter table public.life_areas enable row level security;
alter table public.life_areas force row level security;
alter table public.life_area_current_states enable row level security;
alter table public.life_area_current_states force row level security;
alter table public.goals enable row level security;
alter table public.goals force row level security;
alter table public.goal_decisions enable row level security;
alter table public.goal_decisions force row level security;
alter table public.projects enable row level security;
alter table public.projects force row level security;
alter table public.routines enable row level security;
alter table public.routines force row level security;
alter table public.current_contexts enable row level security;
alter table public.current_contexts force row level security;
alter table public.life_evidence enable row level security;
alter table public.life_evidence force row level security;
alter table public.daily_action_current_contexts enable row level security;
alter table public.daily_action_current_contexts force row level security;

create policy "Users can read their own life areas"
on public.life_areas for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can read their own life area current states"
on public.life_area_current_states for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can read their own goals"
on public.goals for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can read their own goal decisions"
on public.goal_decisions for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can read their own projects"
on public.projects for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can read their own routines"
on public.routines for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can read their own current contexts"
on public.current_contexts for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can read their own life evidence"
on public.life_evidence for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can read their own action context links"
on public.daily_action_current_contexts for select to authenticated
using ((select auth.uid()) = user_id);

revoke all on table public.life_areas from public, anon, authenticated;
revoke all on table public.life_area_current_states from public, anon, authenticated;
revoke all on table public.goals from public, anon, authenticated;
revoke all on table public.goal_decisions from public, anon, authenticated;
revoke all on table public.projects from public, anon, authenticated;
revoke all on table public.routines from public, anon, authenticated;
revoke all on table public.current_contexts from public, anon, authenticated;
revoke all on table public.life_evidence from public, anon, authenticated;
revoke all on table public.daily_action_current_contexts from public, anon, authenticated;

grant select on table public.life_areas to authenticated;
grant select on table public.life_area_current_states to authenticated;
grant select on table public.goals to authenticated;
grant select on table public.goal_decisions to authenticated;
grant select on table public.projects to authenticated;
grant select on table public.routines to authenticated;
grant select on table public.current_contexts to authenticated;
grant select on table public.life_evidence to authenticated;
grant select on table public.daily_action_current_contexts to authenticated;

create function public.create_life_area(
  p_name text,
  p_sort_order integer default 0,
  p_created_via public.life_model_provenance default 'user_stated'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_life_area_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  insert into public.life_areas (user_id, name, sort_order, created_via)
  values (v_user_id, btrim(p_name), p_sort_order, p_created_via)
  returning id into v_life_area_id;

  return v_life_area_id;
end;
$$;

create function public.set_life_area_current_state(
  p_life_area_id uuid,
  p_summary text,
  p_as_of_date date,
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
  for update;

  if not found then
    raise exception 'Life Area not found';
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
    p_life_area_id,
    v_user_id,
    btrim(p_summary),
    p_as_of_date,
    p_created_via,
    p_source_proposal_id,
    now()
  )
  on conflict (life_area_id) do update
  set
    summary = excluded.summary,
    as_of_date = excluded.as_of_date,
    created_via = excluded.created_via,
    source_proposal_id = excluded.source_proposal_id,
    confirmed_at = excluded.confirmed_at;
end;
$$;

create function public.create_goal(
  p_life_area_id uuid,
  p_title text,
  p_desired_outcome text,
  p_status public.goal_status default 'exploring',
  p_target_start_date date default null,
  p_target_end_date date default null,
  p_target_confidence public.life_target_confidence default null,
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
  v_goal_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  insert into public.goals (
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
    v_user_id,
    p_life_area_id,
    btrim(p_title),
    btrim(p_desired_outcome),
    p_status,
    p_target_start_date,
    p_target_end_date,
    p_target_confidence,
    p_created_via,
    p_source_proposal_id
  )
  returning id into v_goal_id;

  return v_goal_id;
end;
$$;

create function public.record_goal_decision(
  p_goal_id uuid,
  p_decision_type public.goal_decision_type,
  p_rationale text,
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
  v_decision_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

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
    p_decision_type,
    btrim(p_rationale),
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

create function public.create_project(
  p_life_area_id uuid,
  p_title text,
  p_desired_outcome text,
  p_goal_id uuid default null,
  p_parent_project_id uuid default null,
  p_status public.project_status default 'planned',
  p_target_start_date date default null,
  p_target_end_date date default null,
  p_target_confidence public.life_target_confidence default null,
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
  v_project_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_goal_id is not null and not exists (
    select 1 from public.goals
    where id = p_goal_id
      and user_id = v_user_id
      and life_area_id = p_life_area_id
  ) then
    raise exception 'Goal does not belong to the selected Life Area';
  end if;

  if p_parent_project_id is not null and not exists (
    select 1 from public.projects
    where id = p_parent_project_id
      and user_id = v_user_id
      and life_area_id = p_life_area_id
  ) then
    raise exception 'Parent Project does not belong to the selected Life Area';
  end if;

  insert into public.projects (
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
    v_user_id,
    p_life_area_id,
    p_goal_id,
    p_parent_project_id,
    btrim(p_title),
    btrim(p_desired_outcome),
    p_status,
    p_target_start_date,
    p_target_end_date,
    p_target_confidence,
    p_created_via,
    p_source_proposal_id
  )
  returning id into v_project_id;

  return v_project_id;
end;
$$;

create function public.create_routine(
  p_life_area_id uuid,
  p_title text,
  p_cadence public.routine_cadence,
  p_estimated_minutes integer,
  p_goal_id uuid default null,
  p_project_id uuid default null,
  p_status public.routine_status default 'active',
  p_cadence_count smallint default null,
  p_weekdays smallint[] default '{}',
  p_preferred_time time without time zone default null,
  p_skip_policy public.routine_skip_policy default 'skip',
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
  v_routine_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_goal_id is not null and not exists (
    select 1 from public.goals
    where id = p_goal_id
      and user_id = v_user_id
      and life_area_id = p_life_area_id
  ) then
    raise exception 'Goal does not belong to the selected Life Area';
  end if;

  if p_project_id is not null and not exists (
    select 1 from public.projects
    where id = p_project_id
      and user_id = v_user_id
      and life_area_id = p_life_area_id
  ) then
    raise exception 'Project does not belong to the selected Life Area';
  end if;

  insert into public.routines (
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
    v_user_id,
    p_life_area_id,
    p_goal_id,
    p_project_id,
    btrim(p_title),
    p_status,
    p_cadence,
    p_cadence_count,
    coalesce(p_weekdays, '{}'::smallint[]),
    p_estimated_minutes,
    p_preferred_time,
    p_skip_policy,
    p_created_via,
    p_source_proposal_id
  )
  returning id into v_routine_id;

  return v_routine_id;
end;
$$;

create function public.create_current_context(
  p_life_area_id uuid,
  p_title text,
  p_planning_impact text,
  p_started_on date,
  p_expected_end_start date default null,
  p_expected_end_end date default null,
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
  v_context_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  insert into public.current_contexts (
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
    v_user_id,
    p_life_area_id,
    btrim(p_title),
    btrim(p_planning_impact),
    p_started_on,
    p_expected_end_start,
    p_expected_end_end,
    p_created_via,
    p_source_proposal_id
  )
  returning id into v_context_id;

  return v_context_id;
end;
$$;

create function public.create_life_evidence(
  p_life_area_id uuid,
  p_summary text,
  p_occurred_on date,
  p_signal public.life_evidence_signal default 'neutral',
  p_goal_id uuid default null,
  p_project_id uuid default null,
  p_source_daily_action_id uuid default null,
  p_source_calendar_occurrence_id uuid default null,
  p_source_day_correction_id uuid default null,
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
  v_evidence_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_goal_id is not null and not exists (
    select 1 from public.goals
    where id = p_goal_id
      and user_id = v_user_id
      and life_area_id = p_life_area_id
  ) then
    raise exception 'Goal does not belong to the selected Life Area';
  end if;

  if p_project_id is not null and not exists (
    select 1 from public.projects
    where id = p_project_id
      and user_id = v_user_id
      and life_area_id = p_life_area_id
  ) then
    raise exception 'Project does not belong to the selected Life Area';
  end if;

  insert into public.life_evidence (
    user_id,
    life_area_id,
    goal_id,
    project_id,
    summary,
    occurred_on,
    signal,
    source_daily_action_id,
    source_calendar_occurrence_id,
    source_day_correction_id,
    created_via,
    source_proposal_id
  )
  values (
    v_user_id,
    p_life_area_id,
    p_goal_id,
    p_project_id,
    btrim(p_summary),
    p_occurred_on,
    p_signal,
    p_source_daily_action_id,
    p_source_calendar_occurrence_id,
    p_source_day_correction_id,
    p_created_via,
    p_source_proposal_id
  )
  returning id into v_evidence_id;

  return v_evidence_id;
end;
$$;

create function public.set_daily_action_life_relationships(
  p_daily_action_id uuid,
  p_life_area_id uuid default null,
  p_goal_id uuid default null,
  p_project_id uuid default null,
  p_source_routine_id uuid default null,
  p_source_calendar_commitment_id uuid default null,
  p_current_context_ids uuid[] default '{}',
  p_relationship_source public.life_model_provenance default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_context_ids uuid[];
  v_expected_context_count integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  perform 1
  from public.daily_actions
  where id = p_daily_action_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Action not found';
  end if;

  v_context_ids := array(
    select distinct context_id
    from unnest(coalesce(p_current_context_ids, '{}'::uuid[])) as context_id
    order by context_id
  );
  v_expected_context_count := cardinality(v_context_ids);

  if (
    num_nonnulls(
      p_life_area_id,
      p_goal_id,
      p_project_id,
      p_source_routine_id,
      p_source_calendar_commitment_id
    ) > 0
    or v_expected_context_count > 0
  ) and p_relationship_source is null then
    raise exception 'Relationship provenance is required';
  end if;

  if v_expected_context_count > 0 and (
    select count(*)
    from public.current_contexts
    where user_id = v_user_id
      and id = any(v_context_ids)
  ) <> v_expected_context_count then
    raise exception 'Current Context not found';
  end if;

  update public.daily_actions
  set
    life_area_id = p_life_area_id,
    goal_id = p_goal_id,
    project_id = p_project_id,
    source_routine_id = p_source_routine_id,
    source_calendar_commitment_id = p_source_calendar_commitment_id,
    relationship_source = case
      when num_nonnulls(
        p_life_area_id,
        p_goal_id,
        p_project_id,
        p_source_routine_id,
        p_source_calendar_commitment_id
      ) > 0 then p_relationship_source
      else null
    end
  where id = p_daily_action_id
    and user_id = v_user_id;

  delete from public.daily_action_current_contexts
  where daily_action_id = p_daily_action_id
    and user_id = v_user_id;

  insert into public.daily_action_current_contexts (
    user_id,
    daily_action_id,
    current_context_id,
    relationship_source
  )
  select
    v_user_id,
    p_daily_action_id,
    context_id,
    p_relationship_source
  from unnest(v_context_ids) as context_id;
end;
$$;

create function public.set_calendar_commitment_life_relationships(
  p_calendar_commitment_id uuid,
  p_life_area_id uuid default null,
  p_goal_id uuid default null,
  p_project_id uuid default null,
  p_current_context_id uuid default null,
  p_relationship_source public.life_model_provenance default null
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
  from public.calendar_commitments
  where id = p_calendar_commitment_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Calendar commitment not found';
  end if;

  if num_nonnulls(
    p_life_area_id,
    p_goal_id,
    p_project_id,
    p_current_context_id
  ) > 0 and p_relationship_source is null then
    raise exception 'Relationship provenance is required';
  end if;

  update public.calendar_commitments
  set
    life_area_id = p_life_area_id,
    goal_id = p_goal_id,
    project_id = p_project_id,
    current_context_id = p_current_context_id,
    relationship_source = p_relationship_source
  where id = p_calendar_commitment_id
    and user_id = v_user_id;
end;
$$;

create function public.get_life_model()
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

revoke all on function public.create_life_area(
  text,
  integer,
  public.life_model_provenance
) from public, anon, authenticated;
revoke all on function public.set_life_area_current_state(
  uuid,
  text,
  date,
  public.life_model_provenance,
  uuid
) from public, anon, authenticated;
revoke all on function public.create_goal(
  uuid,
  text,
  text,
  public.goal_status,
  date,
  date,
  public.life_target_confidence,
  public.life_model_provenance,
  uuid
) from public, anon, authenticated;
revoke all on function public.record_goal_decision(
  uuid,
  public.goal_decision_type,
  text,
  text,
  text,
  uuid,
  public.life_model_provenance,
  uuid,
  timestamptz
) from public, anon, authenticated;
revoke all on function public.create_project(
  uuid,
  text,
  text,
  uuid,
  uuid,
  public.project_status,
  date,
  date,
  public.life_target_confidence,
  public.life_model_provenance,
  uuid
) from public, anon, authenticated;
revoke all on function public.create_routine(
  uuid,
  text,
  public.routine_cadence,
  integer,
  uuid,
  uuid,
  public.routine_status,
  smallint,
  smallint[],
  time without time zone,
  public.routine_skip_policy,
  public.life_model_provenance,
  uuid
) from public, anon, authenticated;
revoke all on function public.create_current_context(
  uuid,
  text,
  text,
  date,
  date,
  date,
  public.life_model_provenance,
  uuid
) from public, anon, authenticated;
revoke all on function public.create_life_evidence(
  uuid,
  text,
  date,
  public.life_evidence_signal,
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  public.life_model_provenance,
  uuid
) from public, anon, authenticated;
revoke all on function public.set_daily_action_life_relationships(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  uuid[],
  public.life_model_provenance
) from public, anon, authenticated;
revoke all on function public.set_calendar_commitment_life_relationships(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  public.life_model_provenance
) from public, anon, authenticated;
revoke all on function public.get_life_model()
from public, anon, authenticated;

grant execute on function public.create_life_area(
  text,
  integer,
  public.life_model_provenance
) to authenticated;
grant execute on function public.set_life_area_current_state(
  uuid,
  text,
  date,
  public.life_model_provenance,
  uuid
) to authenticated;
grant execute on function public.create_goal(
  uuid,
  text,
  text,
  public.goal_status,
  date,
  date,
  public.life_target_confidence,
  public.life_model_provenance,
  uuid
) to authenticated;
grant execute on function public.record_goal_decision(
  uuid,
  public.goal_decision_type,
  text,
  text,
  text,
  uuid,
  public.life_model_provenance,
  uuid,
  timestamptz
) to authenticated;
grant execute on function public.create_project(
  uuid,
  text,
  text,
  uuid,
  uuid,
  public.project_status,
  date,
  date,
  public.life_target_confidence,
  public.life_model_provenance,
  uuid
) to authenticated;
grant execute on function public.create_routine(
  uuid,
  text,
  public.routine_cadence,
  integer,
  uuid,
  uuid,
  public.routine_status,
  smallint,
  smallint[],
  time without time zone,
  public.routine_skip_policy,
  public.life_model_provenance,
  uuid
) to authenticated;
grant execute on function public.create_current_context(
  uuid,
  text,
  text,
  date,
  date,
  date,
  public.life_model_provenance,
  uuid
) to authenticated;
grant execute on function public.create_life_evidence(
  uuid,
  text,
  date,
  public.life_evidence_signal,
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  public.life_model_provenance,
  uuid
) to authenticated;
grant execute on function public.set_daily_action_life_relationships(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  uuid[],
  public.life_model_provenance
) to authenticated;
grant execute on function public.set_calendar_commitment_life_relationships(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  public.life_model_provenance
) to authenticated;
grant execute on function public.get_life_model()
to authenticated;

notify pgrst, 'reload schema';
