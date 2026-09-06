create table public.clarity_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  constraint clarity_conversations_id_user_unique unique (id, user_id)
);

create table public.clarity_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  user_id uuid not null,
  role text not null,
  content text not null,
  created_at timestamptz not null default now(),
  invocation_type text not null default 'general',
  subject_action_id uuid,
  subject_calendar_commitment_id uuid,
  subject_local_date date,
  response_to_message_id uuid unique,
  model_provider text,
  model_version text,
  next_move_type text,
  structured_metadata jsonb,
  latency_ms integer,
  input_tokens integer,
  output_tokens integer,
  constraint clarity_messages_conversation_owner_fkey
    foreign key (conversation_id, user_id)
    references public.clarity_conversations(id, user_id)
    on delete cascade,
  constraint clarity_messages_response_fkey
    foreign key (response_to_message_id)
    references public.clarity_messages(id),
  constraint clarity_messages_role_check check (role in ('user', 'clarity')),
  constraint clarity_messages_content_length check (
    char_length(btrim(content)) between 1 and 8000
  ),
  constraint clarity_messages_invocation_type_check check (
    invocation_type in ('general', 'action', 'calendar_occurrence', 'day')
  ),
  constraint clarity_messages_subject_shape_check check (
    (invocation_type = 'general'
      and subject_action_id is null
      and subject_calendar_commitment_id is null
      and subject_local_date is null)
    or
    (invocation_type = 'action'
      and subject_action_id is not null
      and subject_calendar_commitment_id is null
      and subject_local_date is null)
    or
    (invocation_type = 'calendar_occurrence'
      and subject_action_id is null
      and subject_calendar_commitment_id is not null
      and subject_local_date is not null)
    or
    (invocation_type = 'day'
      and subject_action_id is null
      and subject_calendar_commitment_id is null
      and subject_local_date is not null)
  ),
  constraint clarity_messages_role_metadata_check check (
    (role = 'user'
      and response_to_message_id is null
      and model_provider is null
      and model_version is null
      and next_move_type is null
      and structured_metadata is null
      and latency_ms is null
      and input_tokens is null
      and output_tokens is null)
    or
    (role = 'clarity'
      and response_to_message_id is not null
      and model_provider is not null
      and model_version is not null
      and next_move_type in ('ask', 'clarify', 'synthesize', 'recommend')
      and structured_metadata is not null
      and jsonb_typeof(structured_metadata) = 'object'
      and latency_ms is not null
      and latency_ms >= 0
      and (input_tokens is null or input_tokens >= 0)
      and (output_tokens is null or output_tokens >= 0))
  ),
  constraint clarity_messages_no_hidden_reasoning check (
    structured_metadata is null
    or not (structured_metadata ?| array['reasoning', 'analysis', 'chain_of_thought'])
  )
);

create index clarity_messages_conversation_created_idx
  on public.clarity_messages (conversation_id, created_at desc, id desc);

alter table public.clarity_conversations enable row level security;
alter table public.clarity_conversations force row level security;
alter table public.clarity_messages enable row level security;
alter table public.clarity_messages force row level security;

create policy "Users can read their Clarity conversation"
on public.clarity_conversations
for select
to authenticated
using (user_id = (select auth.uid()));

create policy "Users can read their Clarity messages"
on public.clarity_messages
for select
to authenticated
using (user_id = (select auth.uid()));

revoke all on table public.clarity_conversations from public, anon, authenticated;
revoke all on table public.clarity_messages from public, anon, authenticated;
grant select on table public.clarity_conversations to authenticated;
grant select on table public.clarity_messages to authenticated;

create or replace function public.append_clarity_user_message_v1(
  p_content text,
  p_invocation_type text default 'general',
  p_subject_action_id uuid default null,
  p_subject_calendar_commitment_id uuid default null,
  p_subject_local_date date default null
)
returns table (
  message_id uuid,
  conversation_id uuid,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_conversation_id uuid;
  v_message_id uuid;
  v_created_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if p_content is null or char_length(btrim(p_content)) not between 1 and 8000 then
    raise exception 'Message must contain between 1 and 8000 characters.' using errcode = '22023';
  end if;

  if p_invocation_type not in ('general', 'action', 'calendar_occurrence', 'day') then
    raise exception 'Unsupported Clarity invocation type.' using errcode = '22023';
  end if;

  if p_invocation_type = 'general' then
    if p_subject_action_id is not null or p_subject_calendar_commitment_id is not null or p_subject_local_date is not null then
      raise exception 'General invocation cannot include a subject.' using errcode = '22023';
    end if;
  elsif p_invocation_type = 'action' then
    if p_subject_action_id is null or p_subject_calendar_commitment_id is not null or p_subject_local_date is not null then
      raise exception 'Action invocation is malformed.' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.daily_actions as action
      where action.id = p_subject_action_id and action.user_id = v_user_id
    ) then
      raise exception 'Action not found.' using errcode = 'P0002';
    end if;
  elsif p_invocation_type = 'calendar_occurrence' then
    if p_subject_action_id is not null or p_subject_calendar_commitment_id is null or p_subject_local_date is null then
      raise exception 'Calendar invocation is malformed.' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.calendar_commitments as commitment
      where commitment.id = p_subject_calendar_commitment_id
        and commitment.user_id = v_user_id
        and (
          exists (
            select 1
            from public.calendar_commitment_occurrences as occurrence
            where occurrence.calendar_commitment_id = commitment.id
              and occurrence.user_id = v_user_id
              and occurrence.occurrence_date = p_subject_local_date
          )
          or (
            commitment.status <> 'scheduled'
            and commitment.local_date = p_subject_local_date
          )
          or (
            commitment.status = 'scheduled'
            and private.calendar_commitment_occurs_on_date(
              commitment.local_date,
              commitment.recurrence_unit,
              commitment.recurrence_interval,
              commitment.recurrence_weekdays,
              p_subject_local_date
            )
          )
        )
    ) then
      raise exception 'Calendar occurrence not found.' using errcode = 'P0002';
    end if;
  else
    if p_subject_action_id is not null or p_subject_calendar_commitment_id is not null or p_subject_local_date is null then
      raise exception 'Day invocation is malformed.' using errcode = '22023';
    end if;
  end if;

  insert into public.clarity_conversations (user_id)
  values (v_user_id)
  on conflict (user_id) do update set user_id = excluded.user_id
  returning id into v_conversation_id;

  insert into public.clarity_messages (
    conversation_id,
    user_id,
    role,
    content,
    invocation_type,
    subject_action_id,
    subject_calendar_commitment_id,
    subject_local_date
  ) values (
    v_conversation_id,
    v_user_id,
    'user',
    btrim(p_content),
    p_invocation_type,
    p_subject_action_id,
    p_subject_calendar_commitment_id,
    p_subject_local_date
  )
  returning id, clarity_messages.created_at into v_message_id, v_created_at;

  update public.clarity_conversations
  set last_message_at = v_created_at
  where id = v_conversation_id and user_id = v_user_id;

  return query select v_message_id, v_conversation_id, v_created_at;
end;
$$;

create or replace function public.append_clarity_response_v1(
  p_user_message_id uuid,
  p_content text,
  p_model_provider text,
  p_model_version text,
  p_next_move_type text,
  p_structured_metadata jsonb,
  p_latency_ms integer,
  p_input_tokens integer default null,
  p_output_tokens integer default null
)
returns table (
  message_id uuid,
  conversation_id uuid,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_message public.clarity_messages%rowtype;
  v_message_id uuid;
  v_created_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if p_content is null or char_length(btrim(p_content)) not between 1 and 8000 then
    raise exception 'Response must contain between 1 and 8000 characters.' using errcode = '22023';
  end if;
  if p_model_provider is null or char_length(btrim(p_model_provider)) not between 1 and 80
    or p_model_version is null or char_length(btrim(p_model_version)) not between 1 and 120 then
    raise exception 'Model identity is required.' using errcode = '22023';
  end if;
  if p_next_move_type not in ('ask', 'clarify', 'synthesize', 'recommend') then
    raise exception 'Unsupported next move.' using errcode = '22023';
  end if;
  if p_structured_metadata is null or jsonb_typeof(p_structured_metadata) <> 'object'
    or p_structured_metadata ?| array['reasoning', 'analysis', 'chain_of_thought'] then
    raise exception 'Unsafe structured response metadata.' using errcode = '22023';
  end if;
  if p_latency_ms is null or p_latency_ms < 0
    or p_input_tokens is not null and p_input_tokens < 0
    or p_output_tokens is not null and p_output_tokens < 0 then
    raise exception 'Invalid response metrics.' using errcode = '22023';
  end if;

  select message.* into v_user_message
  from public.clarity_messages as message
  where message.id = p_user_message_id
    and message.user_id = v_user_id
    and message.role = 'user'
  for update;

  if not found then
    raise exception 'User message not found.' using errcode = 'P0002';
  end if;

  select response.id, response.created_at
    into v_message_id, v_created_at
  from public.clarity_messages as response
  where response.response_to_message_id = v_user_message.id
    and response.user_id = v_user_id;

  if found then
    return query select v_message_id, v_user_message.conversation_id, v_created_at;
    return;
  end if;

  insert into public.clarity_messages (
    conversation_id,
    user_id,
    role,
    content,
    invocation_type,
    subject_action_id,
    subject_calendar_commitment_id,
    subject_local_date,
    response_to_message_id,
    model_provider,
    model_version,
    next_move_type,
    structured_metadata,
    latency_ms,
    input_tokens,
    output_tokens
  ) values (
    v_user_message.conversation_id,
    v_user_id,
    'clarity',
    btrim(p_content),
    v_user_message.invocation_type,
    v_user_message.subject_action_id,
    v_user_message.subject_calendar_commitment_id,
    v_user_message.subject_local_date,
    v_user_message.id,
    btrim(p_model_provider),
    btrim(p_model_version),
    p_next_move_type,
    p_structured_metadata,
    p_latency_ms,
    p_input_tokens,
    p_output_tokens
  )
  returning id, clarity_messages.created_at into v_message_id, v_created_at;

  update public.clarity_conversations
  set last_message_at = v_created_at
  where id = v_user_message.conversation_id and user_id = v_user_id;

  return query select v_message_id, v_user_message.conversation_id, v_created_at;
end;
$$;

revoke all on function public.append_clarity_user_message_v1(text, text, uuid, uuid, date)
  from public, anon, authenticated;
revoke all on function public.append_clarity_response_v1(uuid, text, text, text, text, jsonb, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.append_clarity_user_message_v1(text, text, uuid, uuid, date)
  to authenticated;
grant execute on function public.append_clarity_response_v1(uuid, text, text, text, text, jsonb, integer, integer, integer)
  to authenticated;

comment on table public.clarity_conversations is
  'One persistent Clarity conversation per user.';
comment on table public.clarity_messages is
  'Append-only user-visible Clarity conversation messages. Hidden reasoning is never stored.';

notify pgrst, 'reload schema';
