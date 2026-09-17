create type public.clarity_memory_class as enum (
  'durable_memory',
  'current_state'
);

create type public.clarity_memory_truth_state as enum (
  'fact',
  'inference',
  'unknown'
);

create type public.clarity_memory_confidence as enum (
  'low',
  'medium',
  'high'
);

create type public.clarity_memory_materiality as enum (
  'low',
  'medium',
  'high'
);

create type public.clarity_memory_status as enum (
  'active',
  'superseded',
  'retracted'
);

create type public.clarity_memory_source_type as enum (
  'onboarding_confirmation',
  'onboarding_message',
  'clarity_message'
);

create table public.clarity_memory_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  memory_class public.clarity_memory_class not null,
  truth_state public.clarity_memory_truth_state not null,
  topic text not null,
  statement text not null,
  confidence public.clarity_memory_confidence not null,
  materiality public.clarity_memory_materiality not null,
  status public.clarity_memory_status not null default 'active',
  observed_at timestamptz,
  effective_on date,
  review_after timestamptz,
  confirmed_at timestamptz not null,
  superseded_at timestamptz,
  superseded_by_item_id uuid,
  origin_onboarding_session_id uuid,
  origin_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clarity_memory_items_id_user_unique unique (id, user_id),
  constraint clarity_memory_items_topic_length check (
    char_length(btrim(topic)) between 1 and 120
  ),
  constraint clarity_memory_items_statement_length check (
    char_length(btrim(statement)) between 1 and 1000
  ),
  constraint clarity_memory_items_origin_key_length check (
    origin_key is null or char_length(btrim(origin_key)) between 1 and 240
  ),
  constraint clarity_memory_items_current_state_observed check (
    memory_class <> 'current_state' or observed_at is not null
  ),
  constraint clarity_memory_items_durable_review_check check (
    memory_class <> 'durable_memory' or review_after is null
  ),
  constraint clarity_memory_items_review_order check (
    review_after is null
    or (observed_at is not null and review_after > observed_at)
  ),
  constraint clarity_memory_items_origin_pair check (
    (origin_onboarding_session_id is null) = (origin_key is null)
  ),
  constraint clarity_memory_items_origin_owner_fkey
    foreign key (origin_onboarding_session_id, user_id)
    references public.onboarding_sessions(id, user_id),
  constraint clarity_memory_items_no_self_supersession check (
    superseded_by_item_id is null or superseded_by_item_id <> id
  ),
  constraint clarity_memory_items_status_shape check (
    (
      status = 'active'
      and superseded_at is null
      and superseded_by_item_id is null
    )
    or (
      status = 'superseded'
      and superseded_at is not null
      and superseded_by_item_id is not null
    )
    or (
      status = 'retracted'
      and superseded_at is not null
      and superseded_by_item_id is null
    )
  )
);

alter table public.clarity_memory_items
  add constraint clarity_memory_items_superseded_owner_fkey
  foreign key (superseded_by_item_id, user_id)
  references public.clarity_memory_items(id, user_id);

create unique index clarity_memory_items_onboarding_origin_key
  on public.clarity_memory_items (
    user_id,
    origin_onboarding_session_id,
    origin_key
  )
  where origin_onboarding_session_id is not null;

create index clarity_memory_items_owner_active_class_idx
  on public.clarity_memory_items (
    user_id,
    memory_class,
    materiality,
    confirmed_at desc,
    id
  )
  where status = 'active';

create index clarity_memory_items_owner_review_idx
  on public.clarity_memory_items (user_id, review_after, observed_at desc)
  where status = 'active' and memory_class = 'current_state';

create table public.clarity_memory_item_sources (
  id uuid primary key default gen_random_uuid(),
  memory_item_id uuid not null,
  user_id uuid not null,
  source_type public.clarity_memory_source_type not null,
  onboarding_session_id uuid,
  onboarding_message_id uuid,
  clarity_message_id uuid,
  created_at timestamptz not null default now(),
  constraint clarity_memory_item_sources_item_owner_fkey
    foreign key (memory_item_id, user_id)
    references public.clarity_memory_items(id, user_id)
    on delete cascade,
  constraint clarity_memory_item_sources_session_owner_fkey
    foreign key (onboarding_session_id, user_id)
    references public.onboarding_sessions(id, user_id),
  constraint clarity_memory_item_sources_onboarding_message_owner_fkey
    foreign key (onboarding_message_id, user_id)
    references public.onboarding_messages(id, user_id),
  constraint clarity_memory_item_sources_clarity_message_owner_fkey
    foreign key (clarity_message_id, user_id)
    references public.clarity_messages(id, user_id),
  constraint clarity_memory_item_sources_exact_reference check (
    (
      source_type = 'onboarding_confirmation'
      and onboarding_session_id is not null
      and onboarding_message_id is null
      and clarity_message_id is null
    )
    or (
      source_type = 'onboarding_message'
      and onboarding_session_id is null
      and onboarding_message_id is not null
      and clarity_message_id is null
    )
    or (
      source_type = 'clarity_message'
      and onboarding_session_id is null
      and onboarding_message_id is null
      and clarity_message_id is not null
    )
  )
);

create unique index clarity_memory_sources_confirmation_unique
  on public.clarity_memory_item_sources (memory_item_id, onboarding_session_id)
  where source_type = 'onboarding_confirmation';

create unique index clarity_memory_sources_onboarding_message_unique
  on public.clarity_memory_item_sources (memory_item_id, onboarding_message_id)
  where source_type = 'onboarding_message';

create unique index clarity_memory_sources_clarity_message_unique
  on public.clarity_memory_item_sources (memory_item_id, clarity_message_id)
  where source_type = 'clarity_message';

create index clarity_memory_item_sources_owner_item_idx
  on public.clarity_memory_item_sources (user_id, memory_item_id, source_type);

create trigger clarity_memory_items_set_updated_at
before update on public.clarity_memory_items
for each row execute function public.set_updated_at();

alter table public.clarity_memory_items enable row level security;
alter table public.clarity_memory_items force row level security;
alter table public.clarity_memory_item_sources enable row level security;
alter table public.clarity_memory_item_sources force row level security;

create policy "Users can read their own Clarity memory"
on public.clarity_memory_items
for select
to authenticated
using (user_id = (select auth.uid()));

create policy "Users can read their own Clarity memory sources"
on public.clarity_memory_item_sources
for select
to authenticated
using (user_id = (select auth.uid()));

revoke all on table public.clarity_memory_items
  from public, anon, authenticated;
revoke all on table public.clarity_memory_item_sources
  from public, anon, authenticated;
grant select on table public.clarity_memory_items to authenticated;
grant select on table public.clarity_memory_item_sources to authenticated;

create function private.classify_onboarding_memory_v1(
  p_category text,
  p_statement text
)
returns public.clarity_memory_class
language sql
immutable
set search_path = ''
as $$
  select case
    when p_category = 'desiredFuture'
      then 'durable_memory'::public.clarity_memory_class
    when p_category in (
      'constraints',
      'currentPriorityOrPressure',
      'possibleRoutes',
      'route',
      'unknown'
    ) then 'current_state'::public.clarity_memory_class
    when p_category = 'capabilitiesAndAssets'
      and lower(p_statement) ~
        '(saving|cash|runway|debt|repayment|current income|current salary)'
      then 'current_state'::public.clarity_memory_class
    when p_category = 'currentReality'
      and lower(p_statement) ~
        '(previously|used to|work(ed)? as|work history|experience|qualified|qualification|degree|certif)'
      then 'durable_memory'::public.clarity_memory_class
    when lower(p_statement) ~
      '(currently|right now|at the moment|unemployed|job hunting|applying|interview|current income|current salary|saving|runway|debt|repayment|rent|mortgage|pressure|priority|bottleneck|temporary|this week|this month|active project)'
      then 'current_state'::public.clarity_memory_class
    when lower(p_statement) ~
      '(previously|used to|work(ed)? as|work history|experience|skill|qualified|qualification|degree|certif|demonstrated|has shown|recurring pattern|preference|prefers|values)'
      then 'durable_memory'::public.clarity_memory_class
    when p_category in (
      'desiredFuture',
      'capabilitiesAndAssets',
      'behavioralEvidence',
      'insight'
    ) then 'durable_memory'::public.clarity_memory_class
    else 'current_state'::public.clarity_memory_class
  end;
$$;

create function private.onboarding_memory_materiality_v1(
  p_category text
)
returns public.clarity_memory_materiality
language sql
immutable
set search_path = ''
as $$
  select case
    when p_category = 'currentPriorityOrPressure'
      then 'high'::public.clarity_memory_materiality
    when p_category in (
      'currentReality',
      'constraints',
      'possibleRoutes',
      'route',
      'insight'
    ) then 'medium'::public.clarity_memory_materiality
    else 'low'::public.clarity_memory_materiality
  end;
$$;

create function private.add_clarity_memory_source_v1(
  p_memory_item_id uuid,
  p_user_id uuid,
  p_source_type public.clarity_memory_source_type,
  p_source_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_source_id is null then
    raise exception 'A memory source is required.' using errcode = '22023';
  end if;

  if p_source_type = 'onboarding_confirmation' then
    if not exists (
      select 1
      from public.onboarding_sessions as session
      where session.id = p_source_id
        and session.user_id = p_user_id
    ) then
      raise exception 'Memory source is unavailable.' using errcode = 'P0002';
    end if;
    insert into public.clarity_memory_item_sources (
      memory_item_id,
      user_id,
      source_type,
      onboarding_session_id
    ) values (
      p_memory_item_id,
      p_user_id,
      p_source_type,
      p_source_id
    ) on conflict do nothing;
  elsif p_source_type = 'onboarding_message' then
    if not exists (
      select 1
      from public.onboarding_messages as message
      where message.id = p_source_id
        and message.user_id = p_user_id
    ) then
      raise exception 'Memory source is unavailable.' using errcode = 'P0002';
    end if;
    insert into public.clarity_memory_item_sources (
      memory_item_id,
      user_id,
      source_type,
      onboarding_message_id
    ) values (
      p_memory_item_id,
      p_user_id,
      p_source_type,
      p_source_id
    ) on conflict do nothing;
  elsif p_source_type = 'clarity_message' then
    if not exists (
      select 1
      from public.clarity_messages as message
      where message.id = p_source_id
        and message.user_id = p_user_id
    ) then
      raise exception 'Memory source is unavailable.' using errcode = 'P0002';
    end if;
    insert into public.clarity_memory_item_sources (
      memory_item_id,
      user_id,
      source_type,
      clarity_message_id
    ) values (
      p_memory_item_id,
      p_user_id,
      p_source_type,
      p_source_id
    ) on conflict do nothing;
  else
    raise exception 'Unsupported memory source.' using errcode = '22023';
  end if;
end;
$$;

create function private.insert_onboarding_memory_item_v1(
  p_user_id uuid,
  p_session_id uuid,
  p_origin_key text,
  p_category text,
  p_topic text,
  p_statement text,
  p_truth_state text,
  p_confidence text,
  p_materiality text,
  p_evidence_message_ids jsonb,
  p_confirmed_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item_id uuid;
  v_memory_class public.clarity_memory_class;
  v_truth_state public.clarity_memory_truth_state;
  v_confidence public.clarity_memory_confidence;
  v_materiality public.clarity_memory_materiality;
  v_evidence jsonb := coalesce(p_evidence_message_ids, '[]'::jsonb);
  v_expected_evidence_count integer;
  v_owned_evidence_count integer;
begin
  if nullif(btrim(p_statement), '') is null
    or char_length(btrim(p_statement)) > 1000 then
    raise exception 'Invalid onboarding memory statement.' using errcode = '22023';
  end if;
  if nullif(btrim(p_topic), '') is null
    or char_length(btrim(p_topic)) > 120 then
    raise exception 'Invalid onboarding memory topic.' using errcode = '22023';
  end if;
  if nullif(btrim(p_origin_key), '') is null
    or char_length(btrim(p_origin_key)) > 240 then
    raise exception 'Invalid onboarding memory origin.' using errcode = '22023';
  end if;
  if p_truth_state not in ('fact', 'inference', 'unknown') then
    raise exception 'Invalid onboarding memory truth state.' using errcode = '22023';
  end if;
  if p_confidence not in ('low', 'medium', 'high') then
    raise exception 'Invalid onboarding memory confidence.' using errcode = '22023';
  end if;
  if p_materiality is not null
    and p_materiality not in ('low', 'medium', 'high') then
    raise exception 'Invalid onboarding memory materiality.' using errcode = '22023';
  end if;
  if jsonb_typeof(v_evidence) <> 'array' then
    raise exception 'Invalid onboarding memory evidence.' using errcode = '22023';
  end if;

  v_memory_class := private.classify_onboarding_memory_v1(
    p_category,
    p_statement
  );
  v_truth_state := p_truth_state::public.clarity_memory_truth_state;
  v_confidence := p_confidence::public.clarity_memory_confidence;
  v_materiality := coalesce(
    p_materiality::public.clarity_memory_materiality,
    private.onboarding_memory_materiality_v1(p_category)
  );

  insert into public.clarity_memory_items (
    user_id,
    memory_class,
    truth_state,
    topic,
    statement,
    confidence,
    materiality,
    status,
    observed_at,
    effective_on,
    review_after,
    confirmed_at,
    origin_onboarding_session_id,
    origin_key
  ) values (
    p_user_id,
    v_memory_class,
    v_truth_state,
    btrim(p_topic),
    btrim(p_statement),
    v_confidence,
    v_materiality,
    'active',
    case when v_memory_class = 'current_state' then p_confirmed_at else null end,
    null,
    case
      when v_memory_class = 'current_state' then p_confirmed_at + interval '30 days'
      else null
    end,
    p_confirmed_at,
    p_session_id,
    btrim(p_origin_key)
  )
  on conflict (user_id, origin_onboarding_session_id, origin_key)
    where origin_onboarding_session_id is not null
  do nothing
  returning id into v_item_id;

  if v_item_id is null then
    select item.id
    into strict v_item_id
    from public.clarity_memory_items as item
    where item.user_id = p_user_id
      and item.origin_onboarding_session_id = p_session_id
      and item.origin_key = btrim(p_origin_key);
  end if;

  perform private.add_clarity_memory_source_v1(
    v_item_id,
    p_user_id,
    'onboarding_confirmation',
    p_session_id
  );

  select count(distinct evidence.value)
  into v_expected_evidence_count
  from jsonb_array_elements_text(v_evidence) as evidence(value);

  select count(distinct message.id)
  into v_owned_evidence_count
  from jsonb_array_elements_text(v_evidence) as evidence(value)
  join public.onboarding_messages as message
    on message.id = evidence.value::uuid
   and message.user_id = p_user_id
   and message.onboarding_session_id = p_session_id;

  if v_owned_evidence_count <> v_expected_evidence_count then
    raise exception 'Onboarding memory evidence is unavailable.'
      using errcode = 'P0002';
  end if;

  insert into public.clarity_memory_item_sources (
    memory_item_id,
    user_id,
    source_type,
    onboarding_message_id
  )
  select
    v_item_id,
    p_user_id,
    'onboarding_message',
    message.id
  from jsonb_array_elements_text(v_evidence) as evidence(value)
  join public.onboarding_messages as message
    on message.id = evidence.value::uuid
   and message.user_id = p_user_id
   and message.onboarding_session_id = p_session_id
  on conflict do nothing;

  return v_item_id;
end;
$$;

create function private.seed_confirmed_onboarding_memory_v1(
  p_user_id uuid,
  p_session_id uuid,
  p_snapshot jsonb,
  p_confirmed_at timestamptz
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category text;
  v_topic text;
  v_entry record;
  v_count integer := 0;
begin
  if jsonb_typeof(p_snapshot) <> 'object'
    or jsonb_typeof(p_snapshot -> 'understanding') <> 'object' then
    raise exception 'Confirmed onboarding understanding is invalid.'
      using errcode = '22023';
  end if;

  foreach v_category in array array[
    'currentReality',
    'desiredFuture',
    'capabilitiesAndAssets',
    'constraints',
    'behavioralEvidence',
    'currentPriorityOrPressure',
    'possibleRoutes'
  ] loop
    v_topic := case v_category
      when 'currentReality' then 'current_reality'
      when 'desiredFuture' then 'desired_future'
      when 'capabilitiesAndAssets' then 'capabilities_and_assets'
      when 'behavioralEvidence' then 'behavioral_evidence'
      when 'currentPriorityOrPressure' then 'current_priority_or_pressure'
      when 'possibleRoutes' then 'possible_routes'
      else v_category
    end;

    for v_entry in
      select item.value, item.ordinality
      from jsonb_array_elements(
        coalesce(p_snapshot #> array['understanding', v_category], '[]'::jsonb)
      ) with ordinality as item(value, ordinality)
    loop
      perform private.insert_onboarding_memory_item_v1(
        p_user_id,
        p_session_id,
        format('understanding:%s:%s', v_category, v_entry.ordinality),
        v_category,
        v_topic,
        v_entry.value ->> 'statement',
        v_entry.value ->> 'truthState',
        v_entry.value ->> 'confidence',
        null,
        v_entry.value -> 'evidenceMessageIds',
        p_confirmed_at
      );
      v_count := v_count + 1;
    end loop;
  end loop;

  for v_entry in
    select item.value, item.ordinality
    from jsonb_array_elements(
      coalesce(p_snapshot #> '{artifacts,unknowns}', '[]'::jsonb)
    ) with ordinality as item(value, ordinality)
  loop
    perform private.insert_onboarding_memory_item_v1(
      p_user_id,
      p_session_id,
      format('artifact:unknown:%s', v_entry.ordinality),
      'unknown',
      'material_unknown',
      v_entry.value ->> 'statement',
      'unknown',
      'low',
      v_entry.value ->> 'materiality',
      '[]'::jsonb,
      p_confirmed_at
    );
    v_count := v_count + 1;
  end loop;

  for v_entry in
    select item.value, item.ordinality
    from jsonb_array_elements(
      coalesce(p_snapshot #> '{artifacts,insights}', '[]'::jsonb)
    ) with ordinality as item(value, ordinality)
  loop
    perform private.insert_onboarding_memory_item_v1(
      p_user_id,
      p_session_id,
      format('artifact:insight:%s', v_entry.ordinality),
      'insight',
      'insight',
      v_entry.value ->> 'statement',
      'inference',
      v_entry.value ->> 'confidence',
      'medium',
      v_entry.value -> 'evidenceMessageIds',
      p_confirmed_at
    );
    v_count := v_count + 1;
  end loop;

  for v_entry in
    select item.value, item.ordinality
    from jsonb_array_elements(
      coalesce(p_snapshot #> '{artifacts,routes}', '[]'::jsonb)
    ) with ordinality as item(value, ordinality)
  loop
    perform private.insert_onboarding_memory_item_v1(
      p_user_id,
      p_session_id,
      format('artifact:route:%s', v_entry.ordinality),
      'route',
      'possible_route',
      concat_ws(': ', nullif(btrim(v_entry.value ->> 'label'), ''), btrim(v_entry.value ->> 'rationale')),
      'inference',
      v_entry.value ->> 'confidence',
      'medium',
      v_entry.value -> 'evidenceMessageIds',
      p_confirmed_at
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create function public.supersede_clarity_memory_item_v1(
  p_memory_item_id uuid,
  p_statement text,
  p_truth_state public.clarity_memory_truth_state,
  p_confidence public.clarity_memory_confidence,
  p_materiality public.clarity_memory_materiality,
  p_source_type public.clarity_memory_source_type,
  p_source_id uuid,
  p_observed_at timestamptz default null,
  p_effective_on date default null,
  p_review_after timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing public.clarity_memory_items%rowtype;
  v_new_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select item.*
  into v_existing
  from public.clarity_memory_items as item
  where item.id = p_memory_item_id
    and item.user_id = v_user_id
  for update;

  if not found then
    raise exception 'Memory item not found.' using errcode = 'P0002';
  end if;
  if v_existing.status <> 'active' then
    raise exception 'Only active memory can be superseded.' using errcode = '22023';
  end if;
  if v_existing.truth_state = 'fact' and p_truth_state = 'inference' then
    raise exception 'An inference cannot supersede a fact.' using errcode = '22023';
  end if;
  if nullif(btrim(p_statement), '') is null
    or char_length(btrim(p_statement)) > 1000 then
    raise exception 'Invalid memory statement.' using errcode = '22023';
  end if;
  if v_existing.memory_class = 'current_state' and p_observed_at is null then
    raise exception 'Current State requires an observation time.' using errcode = '22023';
  end if;
  if v_existing.memory_class = 'durable_memory' and p_review_after is not null then
    raise exception 'Durable Memory does not expire.' using errcode = '22023';
  end if;
  if p_review_after is not null and p_review_after <= p_observed_at then
    raise exception 'Review time must follow observation time.' using errcode = '22023';
  end if;

  insert into public.clarity_memory_items (
    user_id,
    memory_class,
    truth_state,
    topic,
    statement,
    confidence,
    materiality,
    status,
    observed_at,
    effective_on,
    review_after,
    confirmed_at
  ) values (
    v_user_id,
    v_existing.memory_class,
    p_truth_state,
    v_existing.topic,
    btrim(p_statement),
    p_confidence,
    p_materiality,
    'active',
    p_observed_at,
    p_effective_on,
    p_review_after,
    v_now
  ) returning id into v_new_id;

  perform private.add_clarity_memory_source_v1(
    v_new_id,
    v_user_id,
    p_source_type,
    p_source_id
  );

  update public.clarity_memory_items
  set
    status = 'superseded',
    superseded_at = v_now,
    superseded_by_item_id = v_new_id
  where id = v_existing.id
    and user_id = v_user_id;

  return v_new_id;
end;
$$;

create function public.retract_clarity_memory_item_v1(
  p_memory_item_id uuid,
  p_source_type public.clarity_memory_source_type,
  p_source_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_status public.clarity_memory_status;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select item.status
  into v_status
  from public.clarity_memory_items as item
  where item.id = p_memory_item_id
    and item.user_id = v_user_id
  for update;

  if not found then
    raise exception 'Memory item not found.' using errcode = 'P0002';
  end if;
  if v_status <> 'active' then
    raise exception 'Only active memory can be retracted.' using errcode = '22023';
  end if;

  perform private.add_clarity_memory_source_v1(
    p_memory_item_id,
    v_user_id,
    p_source_type,
    p_source_id
  );

  update public.clarity_memory_items
  set
    status = 'retracted',
    superseded_at = clock_timestamp(),
    superseded_by_item_id = null
  where id = p_memory_item_id
    and user_id = v_user_id;
end;
$$;

create or replace function public.confirm_onboarding_understanding_v1(
  p_onboarding_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.onboarding_sessions%rowtype;
  v_snapshot jsonb;
  v_latest_artifacts jsonb;
  v_basic_context jsonb;
  v_date_of_birth date;
  v_now timestamptz := clock_timestamp();
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select session.*
  into v_session
  from public.onboarding_sessions as session
  where session.id = p_onboarding_session_id
    and session.user_id = v_user_id
  for update;

  if not found then
    raise exception 'Onboarding session not found.' using errcode = 'P0002';
  end if;

  if v_session.status = 'completed' then
    perform private.seed_confirmed_onboarding_memory_v1(
      v_user_id,
      v_session.id,
      v_session.confirmed_snapshot,
      coalesce(v_session.completed_at, v_now)
    );
    return v_session.confirmed_snapshot;
  end if;
  if v_session.status <> 'in_progress' then
    raise exception 'Onboarding session is not active.' using errcode = '22023';
  end if;
  if v_session.synthesis is null then
    raise exception 'Review a synthesis before confirming.' using errcode = '22023';
  end if;
  if coalesce((v_session.progress ->> 'readyForConfirmation')::boolean, false) is not true then
    raise exception 'Onboarding understanding is not ready to confirm.' using errcode = '22023';
  end if;

  select jsonb_build_object(
    'unknowns', message.structured_output -> 'unknowns',
    'insights', message.structured_output -> 'insights',
    'routes', message.structured_output -> 'routes'
  )
  into v_latest_artifacts
  from public.onboarding_messages as message
  where message.onboarding_session_id = v_session.id
    and message.user_id = v_user_id
    and message.role = 'clarity'
  order by message.created_at desc, message.id desc
  limit 1;

  v_snapshot := jsonb_build_object(
    'version', v_session.onboarding_version,
    'understanding', v_session.understanding,
    'progress', v_session.progress,
    'synthesis', v_session.synthesis,
    'artifacts', coalesce(v_latest_artifacts, '{}'::jsonb),
    'confirmedAt', v_now
  );

  perform private.seed_confirmed_onboarding_memory_v1(
    v_user_id,
    v_session.id,
    v_snapshot,
    v_now
  );

  v_basic_context := v_session.user_draft -> 'basic_context';
  if jsonb_typeof(v_basic_context) = 'object' then
    if nullif(btrim(v_basic_context ->> 'preferred_name'), '') is null
      or char_length(btrim(v_basic_context ->> 'preferred_name')) > 200
      or nullif(btrim(v_basic_context ->> 'city'), '') is null
      or char_length(btrim(v_basic_context ->> 'city')) > 120
      or nullif(btrim(v_basic_context ->> 'country'), '') is null
      or char_length(btrim(v_basic_context ->> 'country')) > 120
      or not public.is_valid_timezone(v_basic_context ->> 'timezone')
      or (v_basic_context ->> 'date_of_birth') !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'Confirmed onboarding profile context is invalid.'
        using errcode = '22023';
    end if;

    v_date_of_birth := (v_basic_context ->> 'date_of_birth')::date;
    if v_date_of_birth > (v_now at time zone (v_basic_context ->> 'timezone'))::date then
      raise exception 'Confirmed onboarding date of birth is invalid.'
        using errcode = '22023';
    end if;

    update public.profiles
    set
      name = btrim(v_basic_context ->> 'preferred_name'),
      date_of_birth = v_date_of_birth,
      city = btrim(v_basic_context ->> 'city'),
      country = btrim(v_basic_context ->> 'country'),
      timezone = v_basic_context ->> 'timezone',
      onboarding_completed = true,
      last_active_at = v_now
    where id = v_user_id;
  else
    update public.profiles
    set
      onboarding_completed = true,
      last_active_at = v_now
    where id = v_user_id;
  end if;

  update public.onboarding_sessions
  set
    status = 'completed',
    current_step = 'confirmed',
    completed_at = v_now,
    confirmed_snapshot = v_snapshot
  where id = v_session.id
    and user_id = v_user_id;

  return v_snapshot;
end;
$$;

-- Existing confirmed V2 sessions can be seeded safely because their snapshot is
-- immutable and the origin identity is unique per owner/session/item.
do $$
declare
  v_session record;
begin
  for v_session in
    select
      session.id,
      session.user_id,
      session.confirmed_snapshot,
      session.completed_at
    from public.onboarding_sessions as session
    where session.status = 'completed'
      and session.confirmed_snapshot is not null
      and session.onboarding_version >= 2
  loop
    perform private.seed_confirmed_onboarding_memory_v1(
      v_session.user_id,
      v_session.id,
      v_session.confirmed_snapshot,
      v_session.completed_at
    );
  end loop;
end;
$$;

revoke all on function private.classify_onboarding_memory_v1(text, text)
  from public, anon, authenticated;
revoke all on function private.onboarding_memory_materiality_v1(text)
  from public, anon, authenticated;
revoke all on function private.add_clarity_memory_source_v1(
  uuid, uuid, public.clarity_memory_source_type, uuid
) from public, anon, authenticated;
revoke all on function private.insert_onboarding_memory_item_v1(
  uuid, uuid, text, text, text, text, text, text, text, jsonb, timestamptz
) from public, anon, authenticated;
revoke all on function private.seed_confirmed_onboarding_memory_v1(
  uuid, uuid, jsonb, timestamptz
) from public, anon, authenticated;

revoke all on function public.supersede_clarity_memory_item_v1(
  uuid,
  text,
  public.clarity_memory_truth_state,
  public.clarity_memory_confidence,
  public.clarity_memory_materiality,
  public.clarity_memory_source_type,
  uuid,
  timestamptz,
  date,
  timestamptz
) from public, anon, authenticated;
revoke all on function public.retract_clarity_memory_item_v1(
  uuid,
  public.clarity_memory_source_type,
  uuid
) from public, anon, authenticated;
revoke all on function public.confirm_onboarding_understanding_v1(uuid)
  from public, anon, authenticated;

grant execute on function public.supersede_clarity_memory_item_v1(
  uuid,
  text,
  public.clarity_memory_truth_state,
  public.clarity_memory_confidence,
  public.clarity_memory_materiality,
  public.clarity_memory_source_type,
  uuid,
  timestamptz,
  date,
  timestamptz
) to authenticated;
grant execute on function public.retract_clarity_memory_item_v1(
  uuid,
  public.clarity_memory_source_type,
  uuid
) to authenticated;
grant execute on function public.confirm_onboarding_understanding_v1(uuid)
  to authenticated;

notify pgrst, 'reload schema';
