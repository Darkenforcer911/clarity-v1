create type public.clarity_change_proposal_type as enum (
  'memory_update'
);

create type public.clarity_change_proposal_status as enum (
  'proposed',
  'dismissed',
  'expired',
  'executed',
  'execution_failed'
);

create table public.clarity_change_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null,
  source_user_message_id uuid not null,
  source_assistant_message_id uuid not null,
  proposal_type public.clarity_change_proposal_type not null,
  status public.clarity_change_proposal_status not null default 'proposed',
  summary text not null,
  rationale text not null,
  payload_version integer not null default 1,
  payload_fingerprint text not null,
  revision integer not null default 1,
  execution_key uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  dismissed_at timestamptz,
  expired_at timestamptz,
  executed_at timestamptz,
  execution_failure_code text,
  dismissal_reason text,
  constraint clarity_change_proposals_id_user_unique unique (id, user_id),
  constraint clarity_change_proposals_conversation_owner_fkey
    foreign key (conversation_id, user_id)
    references public.clarity_conversations(id, user_id)
    on delete cascade,
  constraint clarity_change_proposals_user_message_owner_fkey
    foreign key (source_user_message_id, user_id)
    references public.clarity_messages(id, user_id)
    on delete cascade,
  constraint clarity_change_proposals_assistant_message_owner_fkey
    foreign key (source_assistant_message_id, user_id)
    references public.clarity_messages(id, user_id)
    on delete cascade,
  constraint clarity_change_proposals_one_per_assistant
    unique (source_assistant_message_id),
  constraint clarity_change_proposals_execution_key_unique
    unique (user_id, execution_key),
  constraint clarity_change_proposals_summary_length check (
    char_length(btrim(summary)) between 1 and 240
  ),
  constraint clarity_change_proposals_rationale_length check (
    char_length(btrim(rationale)) between 1 and 1000
  ),
  constraint clarity_change_proposals_payload_version_positive check (
    payload_version >= 1
  ),
  constraint clarity_change_proposals_revision_positive check (
    revision >= 1
  ),
  constraint clarity_change_proposals_fingerprint_shape check (
    payload_fingerprint ~ '^[0-9a-f]{32}$'
  ),
  constraint clarity_change_proposals_failure_code_length check (
    execution_failure_code is null
    or char_length(execution_failure_code) between 1 and 80
  ),
  constraint clarity_change_proposals_dismissal_reason check (
    dismissal_reason is null or dismissal_reason = 'not_now'
  ),
  constraint clarity_change_proposals_status_shape check (
    (
      status = 'proposed'
      and confirmed_at is null
      and dismissed_at is null
      and expired_at is null
      and executed_at is null
      and execution_failure_code is null
      and dismissal_reason is null
    )
    or (
      status = 'dismissed'
      and confirmed_at is null
      and dismissed_at is not null
      and expired_at is null
      and executed_at is null
      and execution_failure_code is null
      and dismissal_reason = 'not_now'
    )
    or (
      status = 'expired'
      and dismissed_at is null
      and expired_at is not null
      and executed_at is null
      and execution_failure_code is not null
      and dismissal_reason is null
    )
    or (
      status = 'executed'
      and confirmed_at is not null
      and dismissed_at is null
      and expired_at is null
      and executed_at is not null
      and execution_failure_code is null
      and dismissal_reason is null
    )
    or (
      status = 'execution_failed'
      and confirmed_at is not null
      and dismissed_at is null
      and expired_at is null
      and executed_at is null
      and execution_failure_code is not null
      and dismissal_reason is null
    )
  )
);

create unique index clarity_change_proposals_one_equivalent_proposed
  on public.clarity_change_proposals (
    user_id,
    proposal_type,
    payload_fingerprint
  )
  where status = 'proposed';

create index clarity_change_proposals_owner_status_created_idx
  on public.clarity_change_proposals (user_id, status, created_at desc, id);

create index clarity_change_proposals_assistant_message_idx
  on public.clarity_change_proposals (
    user_id,
    source_assistant_message_id
  );

create table public.clarity_memory_update_proposals (
  proposal_id uuid primary key,
  user_id uuid not null,
  target_memory_item_id uuid not null,
  expected_target_fingerprint text not null,
  target_statement text not null,
  memory_class public.clarity_memory_class not null,
  topic text not null,
  replacement_statement text not null,
  truth_state public.clarity_memory_truth_state not null,
  confidence public.clarity_memory_confidence not null,
  materiality public.clarity_memory_materiality not null,
  observed_at timestamptz not null,
  effective_on date,
  review_after timestamptz not null,
  result_memory_item_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clarity_memory_update_proposals_id_user_unique
    unique (proposal_id, user_id),
  constraint clarity_memory_update_proposals_proposal_owner_fkey
    foreign key (proposal_id, user_id)
    references public.clarity_change_proposals(id, user_id)
    on delete cascade,
  constraint clarity_memory_update_proposals_target_owner_fkey
    foreign key (target_memory_item_id, user_id)
    references public.clarity_memory_items(id, user_id),
  constraint clarity_memory_update_proposals_result_owner_fkey
    foreign key (result_memory_item_id, user_id)
    references public.clarity_memory_items(id, user_id),
  constraint clarity_memory_update_proposals_target_fingerprint_shape check (
    expected_target_fingerprint ~ '^[0-9a-f]{32}$'
  ),
  constraint clarity_memory_update_proposals_current_state_only check (
    memory_class = 'current_state'
  ),
  constraint clarity_memory_update_proposals_fact_only check (
    truth_state = 'fact'
  ),
  constraint clarity_memory_update_proposals_topic_length check (
    char_length(btrim(topic)) between 1 and 120
  ),
  constraint clarity_memory_update_proposals_target_statement_length check (
    char_length(btrim(target_statement)) between 1 and 1000
  ),
  constraint clarity_memory_update_proposals_statement_length check (
    char_length(btrim(replacement_statement)) between 1 and 1000
  ),
  constraint clarity_memory_update_proposals_distinct_statement check (
    lower(btrim(replacement_statement)) <> lower(btrim(target_statement))
  ),
  constraint clarity_memory_update_proposals_review_order check (
    review_after > observed_at
  )
);

create index clarity_memory_update_proposals_owner_target_idx
  on public.clarity_memory_update_proposals (
    user_id,
    target_memory_item_id,
    proposal_id
  );

create trigger clarity_change_proposals_set_updated_at
before update on public.clarity_change_proposals
for each row execute function public.set_updated_at();

create trigger clarity_memory_update_proposals_set_updated_at
before update on public.clarity_memory_update_proposals
for each row execute function public.set_updated_at();

alter table public.clarity_change_proposals enable row level security;
alter table public.clarity_change_proposals force row level security;
alter table public.clarity_memory_update_proposals enable row level security;
alter table public.clarity_memory_update_proposals force row level security;

create policy "Users can read their own Clarity change proposals"
on public.clarity_change_proposals
for select
to authenticated
using (user_id = (select auth.uid()));

create policy "Users can read their own Clarity Memory update proposals"
on public.clarity_memory_update_proposals
for select
to authenticated
using (user_id = (select auth.uid()));

revoke all on table public.clarity_change_proposals
  from public, anon, authenticated;
revoke all on table public.clarity_memory_update_proposals
  from public, anon, authenticated;
grant select on table public.clarity_change_proposals to authenticated;
grant select on table public.clarity_memory_update_proposals to authenticated;

create function private.clarity_memory_item_fingerprint_v1(
  p_id uuid,
  p_memory_class public.clarity_memory_class,
  p_truth_state public.clarity_memory_truth_state,
  p_topic text,
  p_statement text,
  p_confidence public.clarity_memory_confidence,
  p_materiality public.clarity_memory_materiality,
  p_observed_at timestamptz,
  p_effective_on date,
  p_review_after timestamptz,
  p_confirmed_at timestamptz,
  p_updated_at timestamptz
)
returns text
language sql
immutable
set search_path = ''
as $$
  select md5(concat_ws(
    chr(31),
    p_id::text,
    p_memory_class::text,
    p_truth_state::text,
    btrim(p_topic),
    btrim(p_statement),
    p_confidence::text,
    p_materiality::text,
    coalesce(p_observed_at::text, ''),
    coalesce(p_effective_on::text, ''),
    coalesce(p_review_after::text, ''),
    p_confirmed_at::text,
    p_updated_at::text
  ));
$$;

create function private.normalize_clarity_memory_replacement_statement_v1(
  p_statement text,
  p_effective_on date,
  p_previous_effective_on date default null
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_effective_on is null and p_previous_effective_on is null
      then btrim(p_statement)
    else btrim(regexp_replace(
      btrim(p_statement),
      $date_suffix$(?:[[:space:]]*[·—–-][[:space:]]*|[[:space:]]+)(?:(?:effective[[:space:]]+)?(?:on|from|since)[[:space:]]+)?(?:(?:today|yesterday|tomorrow)|(?:(?:this|last|next)[[:space:]]+)?(?:mon|tues|wednes|thurs|fri|satur|sun)day|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[[:space:]]+[0-9]{1,2}(?:st|nd|rd|th)?(?:,?[[:space:]]+[0-9]{4})?|[0-9]{1,2}(?:st|nd|rd|th)?[[:space:]]+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:[[:space:]]+[0-9]{4})?|[0-9]{1,4}[./-][0-9]{1,2}[./-][0-9]{1,4})[[:space:]]*[.!?]?\Z$date_suffix$,
      '',
      'i'
    ))
  end;
$$;

create function private.clarity_memory_update_payload_fingerprint_v1(
  p_target_memory_item_id uuid,
  p_expected_target_fingerprint text,
  p_replacement_statement text,
  p_truth_state public.clarity_memory_truth_state,
  p_confidence public.clarity_memory_confidence,
  p_materiality public.clarity_memory_materiality,
  p_observed_at timestamptz,
  p_effective_on date,
  p_review_after timestamptz
)
returns text
language sql
immutable
set search_path = ''
as $$
  select md5(concat_ws(
    chr(31),
    'memory_update_v1',
    p_target_memory_item_id::text,
    p_expected_target_fingerprint,
    lower(btrim(p_replacement_statement)),
    p_truth_state::text,
    p_confidence::text,
    p_materiality::text,
    coalesce(p_effective_on::text, '')
  ));
$$;

create or replace function public.append_clarity_response_v2(
  p_user_message_id uuid,
  p_content text,
  p_model_provider text,
  p_model_version text,
  p_next_move_type text,
  p_structured_metadata jsonb,
  p_latency_ms integer,
  p_input_tokens integer default null,
  p_output_tokens integer default null,
  p_proposal_type public.clarity_change_proposal_type default null,
  p_target_memory_item_id uuid default null,
  p_replacement_statement text default null,
  p_effective_on date default null,
  p_proposal_summary text default null,
  p_proposal_rationale text default null
)
returns table (
  message_id uuid,
  conversation_id uuid,
  created_at timestamptz,
  proposal_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_message public.clarity_messages%rowtype;
  v_existing_response_id uuid;
  v_response record;
  v_target public.clarity_memory_items%rowtype;
  v_target_fingerprint text;
  v_payload_fingerprint text;
  v_proposal_id uuid;
  v_truth_state public.clarity_memory_truth_state := 'fact';
  v_confidence public.clarity_memory_confidence := 'high';
  v_observed_at timestamptz;
  v_review_after timestamptz;
  v_timezone text;
  v_replacement_statement text;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select message.*
  into v_user_message
  from public.clarity_messages as message
  where message.id = p_user_message_id
    and message.user_id = v_user_id
    and message.role = 'user'
  for update;

  if not found then
    raise exception 'User message not found.' using errcode = 'P0002';
  end if;

  select response.id
  into v_existing_response_id
  from public.clarity_messages as response
  where response.response_to_message_id = v_user_message.id
    and response.user_id = v_user_id;

  if v_existing_response_id is not null then
    return query
    select
      response.id,
      response.conversation_id,
      response.created_at,
      proposal.id
    from public.clarity_messages as response
    left join public.clarity_change_proposals as proposal
      on proposal.source_assistant_message_id = response.id
     and proposal.user_id = v_user_id
    where response.id = v_existing_response_id
      and response.user_id = v_user_id;
    return;
  end if;

  if p_proposal_type is null then
    if p_target_memory_item_id is not null
      or p_replacement_statement is not null
      or p_effective_on is not null
      or p_proposal_summary is not null
      or p_proposal_rationale is not null then
      raise exception 'Proposal fields require a proposal type.'
        using errcode = '22023';
    end if;
  elsif p_proposal_type = 'memory_update' then
    if p_target_memory_item_id is null
      or nullif(btrim(p_replacement_statement), '') is null
      or nullif(btrim(p_proposal_summary), '') is null
      or nullif(btrim(p_proposal_rationale), '') is null then
      raise exception 'Memory update proposal is incomplete.'
        using errcode = '22023';
    end if;
    v_replacement_statement := private.normalize_clarity_memory_replacement_statement_v1(
      p_replacement_statement,
      p_effective_on
    );
    if nullif(v_replacement_statement, '') is null
      or char_length(v_replacement_statement) > 1000
      or char_length(btrim(p_proposal_summary)) > 240
      or char_length(btrim(p_proposal_rationale)) > 1000 then
      raise exception 'Memory update proposal is too long.'
        using errcode = '22023';
    end if;

    select item.*
    into v_target
    from public.clarity_memory_items as item
    where item.id = p_target_memory_item_id
      and item.user_id = v_user_id
      and item.status = 'active'
      and item.memory_class = 'current_state'
    for share;

    if not found then
      raise exception 'Memory proposal target is unavailable.'
        using errcode = 'P0002';
    end if;
    if lower(v_replacement_statement) = lower(btrim(v_target.statement)) then
      raise exception 'Memory update must change the current state.'
        using errcode = '22023';
    end if;

    select profile.timezone
    into v_timezone
    from public.profiles as profile
    where profile.id = v_user_id;

    if p_effective_on is not null
      and p_effective_on > (v_user_message.created_at at time zone v_timezone)::date then
      raise exception 'A Current State update cannot begin in the future.'
        using errcode = '22023';
    end if;

    v_observed_at := v_user_message.created_at;
    v_review_after := v_observed_at + interval '30 days';
    v_target_fingerprint := private.clarity_memory_item_fingerprint_v1(
      v_target.id,
      v_target.memory_class,
      v_target.truth_state,
      v_target.topic,
      v_target.statement,
      v_target.confidence,
      v_target.materiality,
      v_target.observed_at,
      v_target.effective_on,
      v_target.review_after,
      v_target.confirmed_at,
      v_target.updated_at
    );
    v_payload_fingerprint := private.clarity_memory_update_payload_fingerprint_v1(
      v_target.id,
      v_target_fingerprint,
      v_replacement_statement,
      v_truth_state,
      v_confidence,
      v_target.materiality,
      v_observed_at,
      p_effective_on,
      v_review_after
    );
  end if;

  select response.*
  into v_response
  from public.append_clarity_response_v1(
    p_user_message_id,
    p_content,
    p_model_provider,
    p_model_version,
    p_next_move_type,
    p_structured_metadata,
    p_latency_ms,
    p_input_tokens,
    p_output_tokens
  ) as response;

  if p_proposal_type = 'memory_update' then
    insert into public.clarity_change_proposals (
      user_id,
      conversation_id,
      source_user_message_id,
      source_assistant_message_id,
      proposal_type,
      summary,
      rationale,
      payload_fingerprint
    ) values (
      v_user_id,
      v_user_message.conversation_id,
      v_user_message.id,
      v_response.message_id,
      p_proposal_type,
      btrim(p_proposal_summary),
      btrim(p_proposal_rationale),
      v_payload_fingerprint
    )
    on conflict (user_id, proposal_type, payload_fingerprint)
      where status = 'proposed'
    do nothing
    returning id into v_proposal_id;

    if v_proposal_id is not null then
      insert into public.clarity_memory_update_proposals (
        proposal_id,
        user_id,
        target_memory_item_id,
        expected_target_fingerprint,
        target_statement,
        memory_class,
        topic,
        replacement_statement,
        truth_state,
        confidence,
        materiality,
        observed_at,
        effective_on,
        review_after
      ) values (
        v_proposal_id,
        v_user_id,
        v_target.id,
        v_target_fingerprint,
        v_target.statement,
        v_target.memory_class,
        v_target.topic,
        v_replacement_statement,
        v_truth_state,
        v_confidence,
        v_target.materiality,
        v_observed_at,
        p_effective_on,
        v_review_after
      );
    end if;
  end if;

  return query select
    v_response.message_id,
    v_response.conversation_id,
    v_response.created_at,
    v_proposal_id;
end;
$$;

create function public.edit_clarity_memory_update_proposal_v1(
  p_proposal_id uuid,
  p_expected_revision integer,
  p_replacement_statement text,
  p_effective_on date default null
)
returns table (
  proposal_id uuid,
  status public.clarity_change_proposal_status,
  revision integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_proposal public.clarity_change_proposals%rowtype;
  v_detail public.clarity_memory_update_proposals%rowtype;
  v_target public.clarity_memory_items%rowtype;
  v_current_target_fingerprint text;
  v_payload_fingerprint text;
  v_now timestamptz := clock_timestamp();
  v_timezone text;
  v_replacement_statement text;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if p_expected_revision is null or p_expected_revision < 1 then
    raise exception 'Proposal revision is required.' using errcode = '22023';
  end if;
  if nullif(btrim(p_replacement_statement), '') is null
    or char_length(btrim(p_replacement_statement)) > 1000 then
    raise exception 'Invalid replacement statement.' using errcode = '22023';
  end if;

  select proposal.*
  into v_proposal
  from public.clarity_change_proposals as proposal
  where proposal.id = p_proposal_id
    and proposal.user_id = v_user_id
    and proposal.proposal_type = 'memory_update'
  for update;

  if not found then
    raise exception 'Memory update proposal not found.' using errcode = 'P0002';
  end if;
  if v_proposal.status <> 'proposed' then
    raise exception 'Only a proposed Memory update can be edited.'
      using errcode = '22023';
  end if;
  if v_proposal.revision <> p_expected_revision then
    raise exception 'This proposal changed. Reload it before editing.'
      using errcode = '40001';
  end if;

  select detail.*
  into strict v_detail
  from public.clarity_memory_update_proposals as detail
  where detail.proposal_id = v_proposal.id
    and detail.user_id = v_user_id
  for update;

  v_replacement_statement := private.normalize_clarity_memory_replacement_statement_v1(
    p_replacement_statement,
    p_effective_on,
    v_detail.effective_on
  );
  if nullif(v_replacement_statement, '') is null
    or char_length(v_replacement_statement) > 1000 then
    raise exception 'Invalid replacement statement.' using errcode = '22023';
  end if;

  select item.*
  into v_target
  from public.clarity_memory_items as item
  where item.id = v_detail.target_memory_item_id
    and item.user_id = v_user_id
  for update;

  if not found or v_target.status <> 'active' then
    update public.clarity_change_proposals
    set
      status = 'expired',
      expired_at = v_now,
      execution_failure_code = 'stale_target'
    where id = v_proposal.id and user_id = v_user_id;
    return query select v_proposal.id, 'expired'::public.clarity_change_proposal_status, v_proposal.revision;
    return;
  end if;

  v_current_target_fingerprint := private.clarity_memory_item_fingerprint_v1(
    v_target.id,
    v_target.memory_class,
    v_target.truth_state,
    v_target.topic,
    v_target.statement,
    v_target.confidence,
    v_target.materiality,
    v_target.observed_at,
    v_target.effective_on,
    v_target.review_after,
    v_target.confirmed_at,
    v_target.updated_at
  );
  if v_current_target_fingerprint <> v_detail.expected_target_fingerprint then
    update public.clarity_change_proposals
    set
      status = 'expired',
      expired_at = v_now,
      execution_failure_code = 'stale_target'
    where id = v_proposal.id and user_id = v_user_id;
    return query select v_proposal.id, 'expired'::public.clarity_change_proposal_status, v_proposal.revision;
    return;
  end if;
  if lower(v_replacement_statement) = lower(btrim(v_detail.target_statement)) then
    raise exception 'Memory update must change the current state.'
      using errcode = '22023';
  end if;

  select profile.timezone
  into v_timezone
  from public.profiles as profile
  where profile.id = v_user_id;
  if p_effective_on is not null
    and p_effective_on > (v_now at time zone v_timezone)::date then
    raise exception 'A Current State update cannot begin in the future.'
      using errcode = '22023';
  end if;

  v_payload_fingerprint := private.clarity_memory_update_payload_fingerprint_v1(
    v_detail.target_memory_item_id,
    v_detail.expected_target_fingerprint,
    v_replacement_statement,
    v_detail.truth_state,
    v_detail.confidence,
    v_detail.materiality,
    v_detail.observed_at,
    p_effective_on,
    v_detail.review_after
  );

  update public.clarity_memory_update_proposals as detail
  set
    replacement_statement = v_replacement_statement,
    effective_on = p_effective_on
  where detail.proposal_id = v_proposal.id
    and detail.user_id = v_user_id;

  update public.clarity_change_proposals as proposal
  set
    payload_fingerprint = v_payload_fingerprint,
    revision = proposal.revision + 1
  where proposal.id = v_proposal.id
    and proposal.user_id = v_user_id;

  return query select
    v_proposal.id,
    'proposed'::public.clarity_change_proposal_status,
    v_proposal.revision + 1;
exception
  when unique_violation then
    raise exception 'An equivalent Memory update is already proposed.'
      using errcode = '23505';
end;
$$;

create function public.dismiss_clarity_change_proposal_v1(
  p_proposal_id uuid
)
returns public.clarity_change_proposal_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_status public.clarity_change_proposal_status;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select proposal.status
  into v_status
  from public.clarity_change_proposals as proposal
  where proposal.id = p_proposal_id
    and proposal.user_id = v_user_id
  for update;

  if not found then
    raise exception 'Clarity proposal not found.' using errcode = 'P0002';
  end if;
  if v_status = 'dismissed' then
    return v_status;
  end if;
  if v_status <> 'proposed' then
    raise exception 'Only a proposed change can be dismissed.'
      using errcode = '22023';
  end if;

  update public.clarity_change_proposals
  set
    status = 'dismissed',
    dismissed_at = clock_timestamp(),
    dismissal_reason = 'not_now'
  where id = p_proposal_id and user_id = v_user_id;

  return 'dismissed'::public.clarity_change_proposal_status;
end;
$$;

create function public.execute_clarity_memory_update_proposal_v1(
  p_proposal_id uuid
)
returns table (
  proposal_id uuid,
  status public.clarity_change_proposal_status,
  result_memory_item_id uuid,
  execution_failure_code text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_proposal public.clarity_change_proposals%rowtype;
  v_detail public.clarity_memory_update_proposals%rowtype;
  v_target public.clarity_memory_items%rowtype;
  v_current_target_fingerprint text;
  v_result_memory_item_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select proposal.*
  into v_proposal
  from public.clarity_change_proposals as proposal
  where proposal.id = p_proposal_id
    and proposal.user_id = v_user_id
    and proposal.proposal_type = 'memory_update'
  for update;

  if not found then
    raise exception 'Memory update proposal not found.' using errcode = 'P0002';
  end if;
  if v_proposal.status = 'executed' then
    select detail.result_memory_item_id
    into v_result_memory_item_id
    from public.clarity_memory_update_proposals as detail
    where detail.proposal_id = v_proposal.id
      and detail.user_id = v_user_id;
    return query select
      v_proposal.id,
      v_proposal.status,
      v_result_memory_item_id,
      null::text;
    return;
  end if;
  if v_proposal.status not in ('proposed', 'execution_failed') then
    raise exception 'This Memory update is no longer confirmable.'
      using errcode = '22023';
  end if;

  select detail.*
  into strict v_detail
  from public.clarity_memory_update_proposals as detail
  where detail.proposal_id = v_proposal.id
    and detail.user_id = v_user_id
  for update;

  if not exists (
    select 1
    from public.clarity_messages as user_message
    join public.clarity_messages as assistant_message
      on assistant_message.id = v_proposal.source_assistant_message_id
     and assistant_message.user_id = v_user_id
     and assistant_message.role = 'clarity'
     and assistant_message.response_to_message_id = user_message.id
     and assistant_message.conversation_id = v_proposal.conversation_id
    where user_message.id = v_proposal.source_user_message_id
      and user_message.user_id = v_user_id
      and user_message.role = 'user'
      and user_message.conversation_id = v_proposal.conversation_id
  ) then
    update public.clarity_change_proposals
    set
      status = 'expired',
      confirmed_at = coalesce(confirmed_at, v_now),
      expired_at = v_now,
      execution_failure_code = 'stale_source'
    where id = v_proposal.id and user_id = v_user_id;
    return query select
      v_proposal.id,
      'expired'::public.clarity_change_proposal_status,
      null::uuid,
      'stale_source'::text;
    return;
  end if;

  select item.*
  into v_target
  from public.clarity_memory_items as item
  where item.id = v_detail.target_memory_item_id
    and item.user_id = v_user_id
  for update;

  if not found or v_target.status <> 'active' then
    update public.clarity_change_proposals
    set
      status = 'expired',
      confirmed_at = coalesce(confirmed_at, v_now),
      expired_at = v_now,
      execution_failure_code = 'stale_target'
    where id = v_proposal.id and user_id = v_user_id;
    return query select
      v_proposal.id,
      'expired'::public.clarity_change_proposal_status,
      null::uuid,
      'stale_target'::text;
    return;
  end if;

  v_current_target_fingerprint := private.clarity_memory_item_fingerprint_v1(
    v_target.id,
    v_target.memory_class,
    v_target.truth_state,
    v_target.topic,
    v_target.statement,
    v_target.confidence,
    v_target.materiality,
    v_target.observed_at,
    v_target.effective_on,
    v_target.review_after,
    v_target.confirmed_at,
    v_target.updated_at
  );
  if v_current_target_fingerprint <> v_detail.expected_target_fingerprint then
    update public.clarity_change_proposals
    set
      status = 'expired',
      confirmed_at = coalesce(confirmed_at, v_now),
      expired_at = v_now,
      execution_failure_code = 'stale_target'
    where id = v_proposal.id and user_id = v_user_id;
    return query select
      v_proposal.id,
      'expired'::public.clarity_change_proposal_status,
      null::uuid,
      'stale_target'::text;
    return;
  end if;

  begin
    v_result_memory_item_id := public.supersede_clarity_memory_item_v1(
      v_detail.target_memory_item_id,
      v_detail.replacement_statement,
      v_detail.truth_state,
      v_detail.confidence,
      v_detail.materiality,
      'clarity_message',
      v_proposal.source_user_message_id,
      v_detail.observed_at,
      v_detail.effective_on,
      v_detail.review_after
    );

    update public.clarity_memory_update_proposals as detail
    set result_memory_item_id = v_result_memory_item_id
    where detail.proposal_id = v_proposal.id
      and detail.user_id = v_user_id;

    update public.clarity_change_proposals
    set
      status = 'executed',
      confirmed_at = coalesce(confirmed_at, v_now),
      executed_at = v_now,
      execution_failure_code = null
    where id = v_proposal.id and user_id = v_user_id;
  exception
    when others then
      update public.clarity_change_proposals
      set
        status = 'execution_failed',
        confirmed_at = coalesce(confirmed_at, v_now),
        execution_failure_code = 'memory_write_failed'
      where id = v_proposal.id and user_id = v_user_id;
      return query select
        v_proposal.id,
        'execution_failed'::public.clarity_change_proposal_status,
        null::uuid,
        'memory_write_failed'::text;
      return;
  end;

  return query select
    v_proposal.id,
    'executed'::public.clarity_change_proposal_status,
    v_result_memory_item_id,
    null::text;
end;
$$;

revoke all on function private.clarity_memory_item_fingerprint_v1(
  uuid,
  public.clarity_memory_class,
  public.clarity_memory_truth_state,
  text,
  text,
  public.clarity_memory_confidence,
  public.clarity_memory_materiality,
  timestamptz,
  date,
  timestamptz,
  timestamptz,
  timestamptz
) from public, anon, authenticated;
revoke all on function private.normalize_clarity_memory_replacement_statement_v1(
  text,
  date,
  date
) from public, anon, authenticated;
revoke all on function private.clarity_memory_update_payload_fingerprint_v1(
  uuid,
  text,
  text,
  public.clarity_memory_truth_state,
  public.clarity_memory_confidence,
  public.clarity_memory_materiality,
  timestamptz,
  date,
  timestamptz
) from public, anon, authenticated;

revoke all on function public.append_clarity_response_v2(
  uuid,
  text,
  text,
  text,
  text,
  jsonb,
  integer,
  integer,
  integer,
  public.clarity_change_proposal_type,
  uuid,
  text,
  date,
  text,
  text
) from public, anon, authenticated;
revoke all on function public.edit_clarity_memory_update_proposal_v1(
  uuid, integer, text, date
) from public, anon, authenticated;
revoke all on function public.dismiss_clarity_change_proposal_v1(uuid)
  from public, anon, authenticated;
revoke all on function public.execute_clarity_memory_update_proposal_v1(uuid)
  from public, anon, authenticated;

grant execute on function public.append_clarity_response_v2(
  uuid,
  text,
  text,
  text,
  text,
  jsonb,
  integer,
  integer,
  integer,
  public.clarity_change_proposal_type,
  uuid,
  text,
  date,
  text,
  text
) to authenticated;
grant execute on function public.edit_clarity_memory_update_proposal_v1(
  uuid, integer, text, date
) to authenticated;
grant execute on function public.dismiss_clarity_change_proposal_v1(uuid)
  to authenticated;
grant execute on function public.execute_clarity_memory_update_proposal_v1(uuid)
  to authenticated;

comment on table public.clarity_change_proposals is
  'Owner-scoped, user-visible proposed canonical changes. A proposal is never the canonical mutation itself.';
comment on table public.clarity_memory_update_proposals is
  'Typed Memory / Current State supersession payloads for Clarity Proposal Layer V1.';

notify pgrst, 'reload schema';
