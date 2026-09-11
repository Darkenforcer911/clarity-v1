alter table public.onboarding_sessions
  add column understanding jsonb not null default '{}'::jsonb,
  add column progress jsonb not null default '{}'::jsonb,
  add column synthesis jsonb,
  add column confirmed_snapshot jsonb,
  add column turn_count integer not null default 0,
  add constraint onboarding_sessions_understanding_object check (
    jsonb_typeof(understanding) = 'object'
  ),
  add constraint onboarding_sessions_progress_object check (
    jsonb_typeof(progress) = 'object'
  ),
  add constraint onboarding_sessions_synthesis_object check (
    synthesis is null or jsonb_typeof(synthesis) = 'object'
  ),
  add constraint onboarding_sessions_confirmed_snapshot_object check (
    confirmed_snapshot is null or jsonb_typeof(confirmed_snapshot) = 'object'
  ),
  add constraint onboarding_sessions_turn_count_valid check (
    turn_count between 0 and 100
  ),
  add constraint onboarding_sessions_confirmation_shape check (
    (status = 'completed' and confirmed_snapshot is not null)
    or (status <> 'completed' and confirmed_snapshot is null)
  ) not valid;

-- Pre-V1 completed sessions did not have a reviewed understanding snapshot.
-- Keep them valid while enforcing the invariant for every new confirmation.

create table public.onboarding_messages (
  id uuid primary key default gen_random_uuid(),
  onboarding_session_id uuid not null,
  user_id uuid not null,
  role text not null,
  content text not null,
  created_at timestamptz not null default now(),
  response_to_message_id uuid,
  mode text,
  structured_output jsonb,
  model_provider text,
  model_version text,
  latency_ms integer,
  input_tokens integer,
  output_tokens integer,
  constraint onboarding_messages_session_owner_fkey
    foreign key (onboarding_session_id, user_id)
    references public.onboarding_sessions(id, user_id)
    on delete cascade,
  constraint onboarding_messages_response_fkey
    foreign key (response_to_message_id)
    references public.onboarding_messages(id),
  constraint onboarding_messages_one_response_key unique (response_to_message_id),
  constraint onboarding_messages_role_check check (
    role in ('user', 'clarity')
  ),
  constraint onboarding_messages_content_length check (
    char_length(btrim(content)) between 1 and 10000
  ),
  constraint onboarding_messages_mode_check check (
    mode is null or mode in (
      'UNDERSTAND',
      'CLARIFY',
      'REFLECT_INSIGHT',
      'CHALLENGE',
      'EXPAND_POSSIBILITIES',
      'SYNTHESIZE'
    )
  ),
  constraint onboarding_messages_role_metadata_check check (
    (
      role = 'user'
      and response_to_message_id is null
      and mode is null
      and structured_output is null
      and model_provider is null
      and model_version is null
      and latency_ms is null
      and input_tokens is null
      and output_tokens is null
    )
    or (
      role = 'clarity'
      and response_to_message_id is not null
      and mode is not null
      and structured_output is not null
      and jsonb_typeof(structured_output) = 'object'
      and model_provider is not null
      and model_version is not null
      and latency_ms is not null
      and latency_ms >= 0
      and (input_tokens is null or input_tokens >= 0)
      and (output_tokens is null or output_tokens >= 0)
    )
  ),
  constraint onboarding_messages_no_hidden_reasoning check (
    structured_output is null
    or not (structured_output ?| array['reasoning', 'analysis', 'chain_of_thought'])
  )
);

create index onboarding_messages_session_created_idx
  on public.onboarding_messages (onboarding_session_id, created_at, id);

create index onboarding_messages_user_session_idx
  on public.onboarding_messages (user_id, onboarding_session_id);

alter table public.onboarding_messages enable row level security;
alter table public.onboarding_messages force row level security;

create policy "Users can read their own onboarding messages"
on public.onboarding_messages
for select
to authenticated
using (user_id = (select auth.uid()));

revoke all on table public.onboarding_messages from public, anon, authenticated;
grant select on table public.onboarding_messages to authenticated;

create function public.append_onboarding_user_message_v1(
  p_content text
)
returns table (
  message_id uuid,
  onboarding_session_id uuid,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id uuid;
  v_message_id uuid;
  v_created_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if p_content is null or char_length(btrim(p_content)) not between 1 and 10000 then
    raise exception 'Message must contain between 1 and 10,000 characters.' using errcode = '22023';
  end if;

  select session.id
  into v_session_id
  from public.onboarding_sessions as session
  where session.user_id = v_user_id
    and session.status = 'in_progress'
  for update;

  if not found then
    insert into public.onboarding_sessions (
      user_id,
      onboarding_version,
      current_step,
      user_draft
    ) values (
      v_user_id,
      2,
      'conversation',
      '{}'::jsonb
    )
    returning id into v_session_id;
  else
    update public.onboarding_sessions
    set
      onboarding_version = greatest(onboarding_version, 2),
      current_step = 'conversation'
    where id = v_session_id
      and user_id = v_user_id;
  end if;

  insert into public.onboarding_messages (
    onboarding_session_id,
    user_id,
    role,
    content
  ) values (
    v_session_id,
    v_user_id,
    'user',
    btrim(p_content)
  )
  returning id, onboarding_messages.created_at
  into v_message_id, v_created_at;

  return query select v_message_id, v_session_id, v_created_at;
end;
$$;

create function public.append_onboarding_response_v1(
  p_user_message_id uuid,
  p_content text,
  p_mode text,
  p_structured_output jsonb,
  p_model_provider text,
  p_model_version text,
  p_latency_ms integer,
  p_input_tokens integer default null,
  p_output_tokens integer default null
)
returns table (
  message_id uuid,
  onboarding_session_id uuid,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_message public.onboarding_messages%rowtype;
  v_message_id uuid;
  v_created_at timestamptz;
  v_existing_id uuid;
  v_existing_created_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if p_content is null or char_length(btrim(p_content)) not between 1 and 10000 then
    raise exception 'Response must contain between 1 and 10,000 characters.' using errcode = '22023';
  end if;
  if p_mode not in (
    'UNDERSTAND',
    'CLARIFY',
    'REFLECT_INSIGHT',
    'CHALLENGE',
    'EXPAND_POSSIBILITIES',
    'SYNTHESIZE'
  ) then
    raise exception 'Unsupported onboarding response mode.' using errcode = '22023';
  end if;
  if p_structured_output is null
    or jsonb_typeof(p_structured_output) <> 'object'
    or p_structured_output ?| array['reasoning', 'analysis', 'chain_of_thought'] then
    raise exception 'Unsafe onboarding response metadata.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_structured_output -> 'understanding') <> 'object'
    or jsonb_typeof(p_structured_output -> 'progress') <> 'object'
    or jsonb_typeof(p_structured_output -> 'unknowns') <> 'array'
    or jsonb_typeof(p_structured_output -> 'insights') <> 'array'
    or jsonb_typeof(p_structured_output -> 'routes') <> 'array'
    or jsonb_typeof(p_structured_output -> 'readiness') <> 'object' then
    raise exception 'Incomplete onboarding response metadata.' using errcode = '22023';
  end if;
  if p_model_provider is null or char_length(btrim(p_model_provider)) not between 1 and 80
    or p_model_version is null or char_length(btrim(p_model_version)) not between 1 and 120 then
    raise exception 'Model identity is required.' using errcode = '22023';
  end if;
  if p_latency_ms is null or p_latency_ms < 0
    or p_input_tokens is not null and p_input_tokens < 0
    or p_output_tokens is not null and p_output_tokens < 0 then
    raise exception 'Invalid response metrics.' using errcode = '22023';
  end if;

  select message.*
  into v_user_message
  from public.onboarding_messages as message
  join public.onboarding_sessions as session
    on session.id = message.onboarding_session_id
    and session.user_id = message.user_id
  where message.id = p_user_message_id
    and message.user_id = v_user_id
    and message.role = 'user'
    and session.status = 'in_progress'
  for update of message, session;

  if not found then
    raise exception 'Onboarding message not found.' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.onboarding_messages as later_message
    where later_message.onboarding_session_id = v_user_message.onboarding_session_id
      and later_message.user_id = v_user_id
      and later_message.role = 'user'
      and (later_message.created_at, later_message.id) >
        (v_user_message.created_at, v_user_message.id)
  ) then
    raise exception 'Only the latest onboarding answer can be processed.' using errcode = '22023';
  end if;

  select response.id, response.created_at
  into v_existing_id, v_existing_created_at
  from public.onboarding_messages as response
  where response.response_to_message_id = v_user_message.id
    and response.user_id = v_user_id;

  if found then
    return query
      select v_existing_id, v_user_message.onboarding_session_id, v_existing_created_at;
    return;
  end if;

  insert into public.onboarding_messages (
    onboarding_session_id,
    user_id,
    role,
    content,
    response_to_message_id,
    mode,
    structured_output,
    model_provider,
    model_version,
    latency_ms,
    input_tokens,
    output_tokens
  ) values (
    v_user_message.onboarding_session_id,
    v_user_id,
    'clarity',
    btrim(p_content),
    v_user_message.id,
    p_mode,
    p_structured_output,
    btrim(p_model_provider),
    btrim(p_model_version),
    p_latency_ms,
    p_input_tokens,
    p_output_tokens
  )
  returning id, onboarding_messages.created_at
  into v_message_id, v_created_at;

  update public.onboarding_sessions
  set
    current_step = case
      when p_structured_output -> 'synthesis' <> 'null'::jsonb then 'synthesis'
      else 'conversation'
    end,
    understanding = p_structured_output -> 'understanding',
    progress = p_structured_output -> 'progress',
    synthesis = case
      when p_structured_output -> 'synthesis' = 'null'::jsonb then null
      else p_structured_output -> 'synthesis'
    end,
    turn_count = turn_count + 1
  where id = v_user_message.onboarding_session_id
    and user_id = v_user_id
    and status = 'in_progress';

  return query
    select v_message_id, v_user_message.onboarding_session_id, v_created_at;
end;
$$;

create function public.confirm_onboarding_understanding_v1(
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

  update public.onboarding_sessions
  set
    status = 'completed',
    current_step = 'confirmed',
    completed_at = v_now,
    confirmed_snapshot = v_snapshot
  where id = v_session.id
    and user_id = v_user_id;

  update public.profiles
  set
    onboarding_completed = true,
    last_active_at = v_now
  where id = v_user_id;

  return v_snapshot;
end;
$$;

-- Preserve a substantive answer captured by the earlier onboarding shell.
insert into public.onboarding_messages (
  onboarding_session_id,
  user_id,
  role,
  content,
  created_at
)
select
  session.id,
  session.user_id,
  'user',
  btrim(session.user_draft #>> '{responses,currentReality,answer}'),
  session.updated_at
from public.onboarding_sessions as session
where session.status = 'in_progress'
  and nullif(btrim(session.user_draft #>> '{responses,currentReality,answer}'), '') is not null
  and not exists (
    select 1
    from public.onboarding_messages as message
    where message.onboarding_session_id = session.id
      and message.user_id = session.user_id
  );

revoke all on function public.append_onboarding_user_message_v1(text)
  from public, anon, authenticated;
revoke all on function public.append_onboarding_response_v1(
  uuid, text, text, jsonb, text, text, integer, integer, integer
) from public, anon, authenticated;
revoke all on function public.confirm_onboarding_understanding_v1(uuid)
  from public, anon, authenticated;

grant execute on function public.append_onboarding_user_message_v1(text)
  to authenticated;
grant execute on function public.append_onboarding_response_v1(
  uuid, text, text, jsonb, text, text, integer, integer, integer
) to authenticated;
grant execute on function public.confirm_onboarding_understanding_v1(uuid)
  to authenticated;

notify pgrst, 'reload schema';
