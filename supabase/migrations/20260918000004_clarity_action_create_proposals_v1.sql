create table public.clarity_action_create_proposals (
  proposal_id uuid primary key,
  user_id uuid not null,
  title text not null,
  local_date date not null,
  due_local_date date,
  due_local_time time without time zone,
  estimated_minutes integer,
  result_daily_action_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clarity_action_create_proposals_id_user_unique
    unique (proposal_id, user_id),
  constraint clarity_action_create_proposals_proposal_owner_fkey
    foreign key (proposal_id, user_id)
    references public.clarity_change_proposals(id, user_id)
    on delete cascade,
  constraint clarity_action_create_proposals_result_owner_fkey
    foreign key (result_daily_action_id, user_id)
    references public.daily_actions(id, user_id),
  constraint clarity_action_create_proposals_title_length check (
    char_length(btrim(title)) between 1 and 200
  ),
  constraint clarity_action_create_proposals_due_time_requires_date check (
    due_local_time is null or due_local_date is not null
  ),
  constraint clarity_action_create_proposals_due_order check (
    due_local_date is null or due_local_date >= local_date
  ),
  constraint clarity_action_create_proposals_duration check (
    estimated_minutes is null or estimated_minutes between 1 and 1440
  )
);

create index clarity_action_create_proposals_owner_date_idx
  on public.clarity_action_create_proposals (
    user_id,
    local_date,
    proposal_id
  );

create trigger clarity_action_create_proposals_set_updated_at
before update on public.clarity_action_create_proposals
for each row execute function public.set_updated_at();

alter table public.clarity_action_create_proposals enable row level security;
alter table public.clarity_action_create_proposals force row level security;

create policy "Users can read their own Clarity Action create proposals"
on public.clarity_action_create_proposals
for select
to authenticated
using (user_id = (select auth.uid()));

revoke all on table public.clarity_action_create_proposals
  from public, anon, authenticated;
grant select on table public.clarity_action_create_proposals to authenticated;

create function private.clarity_action_create_payload_fingerprint_v1(
  p_title text,
  p_local_date date,
  p_due_local_date date,
  p_due_local_time time without time zone,
  p_estimated_minutes integer
)
returns text
language sql
immutable
set search_path = ''
as $$
  select md5(concat_ws(
    chr(31),
    'action_create_v1',
    lower(btrim(p_title)),
    p_local_date::text,
    coalesce(p_due_local_date::text, ''),
    coalesce(to_char(p_due_local_time, 'HH24:MI'), ''),
    coalesce(p_estimated_minutes::text, '')
  ));
$$;

create function public.append_clarity_response_v3(
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
  p_proposal_rationale text default null,
  p_action_title text default null,
  p_action_local_date date default null,
  p_action_due_local_date date default null,
  p_action_due_local_time time without time zone default null,
  p_action_estimated_minutes integer default null
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
  v_response record;
  v_proposal_id uuid;
  v_payload_fingerprint text;
  v_timezone text;
  v_today date;
  v_title text := nullif(btrim(p_action_title), '');
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if p_proposal_type is null or p_proposal_type = 'memory_update' then
    if p_action_title is not null
      or p_action_local_date is not null
      or p_action_due_local_date is not null
      or p_action_due_local_time is not null
      or p_action_estimated_minutes is not null then
      raise exception 'Action fields require an Action proposal.'
        using errcode = '22023';
    end if;

    return query
    select response.message_id, response.conversation_id,
      response.created_at, response.proposal_id
    from public.append_clarity_response_v2(
      p_user_message_id,
      p_content,
      p_model_provider,
      p_model_version,
      p_next_move_type,
      p_structured_metadata,
      p_latency_ms,
      p_input_tokens,
      p_output_tokens,
      p_proposal_type,
      p_target_memory_item_id,
      p_replacement_statement,
      p_effective_on,
      p_proposal_summary,
      p_proposal_rationale
    ) as response;
    return;
  end if;

  if p_proposal_type <> 'action_create' then
    raise exception 'Unsupported Clarity proposal type.' using errcode = '22023';
  end if;
  if p_target_memory_item_id is not null
    or p_replacement_statement is not null
    or p_effective_on is not null then
    raise exception 'Memory fields cannot be used for an Action proposal.'
      using errcode = '22023';
  end if;
  if v_title is null
    or p_action_local_date is null
    or nullif(btrim(p_proposal_summary), '') is null
    or nullif(btrim(p_proposal_rationale), '') is null then
    raise exception 'Action proposal is incomplete.' using errcode = '22023';
  end if;
  if char_length(v_title) > 200
    or char_length(btrim(p_proposal_summary)) > 240
    or char_length(btrim(p_proposal_rationale)) > 1000 then
    raise exception 'Action proposal is too long.' using errcode = '22023';
  end if;
  if p_action_due_local_time is not null and p_action_due_local_date is null then
    raise exception 'A Due time requires a Due date.' using errcode = '22023';
  end if;
  if p_action_due_local_date is not null
    and p_action_due_local_date < p_action_local_date then
    raise exception 'Due must be on or after the Action date.'
      using errcode = '22023';
  end if;
  if p_action_estimated_minutes is not null
    and p_action_estimated_minutes not between 1 and 1440 then
    raise exception 'Action duration must be between 1 and 1440 minutes.'
      using errcode = '22023';
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

  select profile.timezone
  into v_timezone
  from public.profiles as profile
  where profile.id = v_user_id;
  if v_timezone is null then
    raise exception 'Profile timezone not found.' using errcode = 'P0002';
  end if;
  v_today := (clock_timestamp() at time zone v_timezone)::date;
  if p_action_local_date < v_today then
    raise exception 'A planned Action cannot be created in the past.'
      using errcode = '22023';
  end if;

  v_payload_fingerprint := private.clarity_action_create_payload_fingerprint_v1(
    v_title,
    p_action_local_date,
    p_action_due_local_date,
    p_action_due_local_time,
    p_action_estimated_minutes
  );

  select response.*
  into v_response
  from public.append_clarity_response_v2(
    p_user_message_id,
    p_content,
    p_model_provider,
    p_model_version,
    p_next_move_type,
    p_structured_metadata,
    p_latency_ms,
    p_input_tokens,
    p_output_tokens,
    null,
    null,
    null,
    null,
    null,
    null
  ) as response;

  if v_response.proposal_id is not null then
    return query select v_response.message_id, v_response.conversation_id,
      v_response.created_at, v_response.proposal_id;
    return;
  end if;

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
    'action_create',
    btrim(p_proposal_summary),
    btrim(p_proposal_rationale),
    v_payload_fingerprint
  )
  on conflict (user_id, proposal_type, payload_fingerprint)
    where status = 'proposed'
  do nothing
  returning id into v_proposal_id;

  if v_proposal_id is not null then
    insert into public.clarity_action_create_proposals (
      proposal_id,
      user_id,
      title,
      local_date,
      due_local_date,
      due_local_time,
      estimated_minutes
    ) values (
      v_proposal_id,
      v_user_id,
      v_title,
      p_action_local_date,
      p_action_due_local_date,
      p_action_due_local_time,
      p_action_estimated_minutes
    );
  end if;

  return query select v_response.message_id, v_response.conversation_id,
    v_response.created_at, v_proposal_id;
end;
$$;

create function public.edit_clarity_action_create_proposal_v1(
  p_proposal_id uuid,
  p_expected_revision integer,
  p_title text,
  p_due_local_date date default null,
  p_due_local_time time without time zone default null,
  p_estimated_minutes integer default null
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
  v_detail public.clarity_action_create_proposals%rowtype;
  v_title text := nullif(btrim(p_title), '');
  v_payload_fingerprint text;
  v_timezone text;
  v_today date;
  v_now timestamptz := clock_timestamp();
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if p_expected_revision is null or p_expected_revision < 1 then
    raise exception 'Proposal revision is required.' using errcode = '22023';
  end if;
  if v_title is null or char_length(v_title) > 200 then
    raise exception 'Action title must be between 1 and 200 characters.'
      using errcode = '22023';
  end if;
  if p_due_local_time is not null and p_due_local_date is null then
    raise exception 'A Due time requires a Due date.' using errcode = '22023';
  end if;
  if p_estimated_minutes is not null
    and p_estimated_minutes not between 1 and 1440 then
    raise exception 'Action duration must be between 1 and 1440 minutes.'
      using errcode = '22023';
  end if;

  select proposal.*
  into v_proposal
  from public.clarity_change_proposals as proposal
  where proposal.id = p_proposal_id
    and proposal.user_id = v_user_id
    and proposal.proposal_type = 'action_create'
  for update;
  if not found then
    raise exception 'Action proposal not found.' using errcode = 'P0002';
  end if;
  if v_proposal.status <> 'proposed' then
    raise exception 'Only a proposed Action can be edited.' using errcode = '22023';
  end if;
  if v_proposal.revision <> p_expected_revision then
    raise exception 'This proposal changed. Reload it before editing.'
      using errcode = '40001';
  end if;

  select detail.*
  into strict v_detail
  from public.clarity_action_create_proposals as detail
  where detail.proposal_id = v_proposal.id
    and detail.user_id = v_user_id
  for update;

  select profile.timezone
  into v_timezone
  from public.profiles as profile
  where profile.id = v_user_id;
  v_today := (v_now at time zone v_timezone)::date;
  if v_detail.local_date < v_today then
    update public.clarity_change_proposals
    set status = 'expired', expired_at = v_now,
      execution_failure_code = 'action_date_passed'
    where id = v_proposal.id and user_id = v_user_id;
    return query select v_proposal.id,
      'expired'::public.clarity_change_proposal_status,
      v_proposal.revision;
    return;
  end if;
  if p_due_local_date is not null
    and p_due_local_date < v_detail.local_date then
    raise exception 'Due must be on or after the Action date.'
      using errcode = '22023';
  end if;

  v_payload_fingerprint := private.clarity_action_create_payload_fingerprint_v1(
    v_title,
    v_detail.local_date,
    p_due_local_date,
    p_due_local_time,
    p_estimated_minutes
  );

  update public.clarity_action_create_proposals as detail
  set title = v_title,
    due_local_date = p_due_local_date,
    due_local_time = p_due_local_time,
    estimated_minutes = p_estimated_minutes
  where detail.proposal_id = v_proposal.id
    and detail.user_id = v_user_id;

  update public.clarity_change_proposals as proposal
  set payload_fingerprint = v_payload_fingerprint,
    revision = proposal.revision + 1
  where proposal.id = v_proposal.id
    and proposal.user_id = v_user_id;

  return query select v_proposal.id,
    'proposed'::public.clarity_change_proposal_status,
    v_proposal.revision + 1;
exception
  when unique_violation then
    raise exception 'An equivalent Action is already proposed.'
      using errcode = '23505';
end;
$$;

create function public.execute_clarity_action_create_proposal_v1(
  p_proposal_id uuid
)
returns table (
  proposal_id uuid,
  status public.clarity_change_proposal_status,
  result_daily_action_id uuid,
  execution_failure_code text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_proposal public.clarity_change_proposals%rowtype;
  v_detail public.clarity_action_create_proposals%rowtype;
  v_result_daily_action_id uuid;
  v_timezone text;
  v_today date;
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
    and proposal.proposal_type = 'action_create'
  for update;
  if not found then
    raise exception 'Action proposal not found.' using errcode = 'P0002';
  end if;

  select detail.*
  into strict v_detail
  from public.clarity_action_create_proposals as detail
  where detail.proposal_id = v_proposal.id
    and detail.user_id = v_user_id
  for update;

  if v_proposal.status = 'executed' then
    return query select v_proposal.id, v_proposal.status,
      v_detail.result_daily_action_id, null::text;
    return;
  end if;
  if v_proposal.status not in ('proposed', 'execution_failed') then
    raise exception 'This Action proposal is no longer confirmable.'
      using errcode = '22023';
  end if;

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
    set status = 'expired', confirmed_at = coalesce(confirmed_at, v_now),
      expired_at = v_now, execution_failure_code = 'stale_source'
    where id = v_proposal.id and user_id = v_user_id;
    return query select v_proposal.id,
      'expired'::public.clarity_change_proposal_status,
      null::uuid, 'stale_source'::text;
    return;
  end if;

  select profile.timezone
  into v_timezone
  from public.profiles as profile
  where profile.id = v_user_id;
  v_today := (v_now at time zone v_timezone)::date;
  if v_detail.local_date < v_today then
    update public.clarity_change_proposals
    set status = 'expired', confirmed_at = coalesce(confirmed_at, v_now),
      expired_at = v_now, execution_failure_code = 'action_date_passed'
    where id = v_proposal.id and user_id = v_user_id;
    return query select v_proposal.id,
      'expired'::public.clarity_change_proposal_status,
      null::uuid, 'action_date_passed'::text;
    return;
  end if;

  begin
    v_result_daily_action_id := public.create_action_occurrence_v1(
      p_local_date => v_detail.local_date,
      p_title => v_detail.title,
      p_duration_minutes => coalesce(v_detail.estimated_minutes, 30),
      p_due_local_date => v_detail.due_local_date,
      p_due_local_time => v_detail.due_local_time,
      p_recurrence_pattern => 'none',
      p_recurrence_days => '{}'::smallint[],
      p_reminder_offsets_minutes => '{}'::integer[]
    );

    update public.clarity_action_create_proposals as detail
    set result_daily_action_id = v_result_daily_action_id
    where detail.proposal_id = v_proposal.id
      and detail.user_id = v_user_id;

    update public.clarity_change_proposals
    set status = 'executed', confirmed_at = coalesce(confirmed_at, v_now),
      executed_at = v_now, execution_failure_code = null
    where id = v_proposal.id and user_id = v_user_id;
  exception
    when others then
      update public.clarity_change_proposals
      set status = 'execution_failed',
        confirmed_at = coalesce(confirmed_at, v_now),
        execution_failure_code = 'action_write_failed'
      where id = v_proposal.id and user_id = v_user_id;
      return query select v_proposal.id,
        'execution_failed'::public.clarity_change_proposal_status,
        null::uuid, 'action_write_failed'::text;
      return;
  end;

  return query select v_proposal.id,
    'executed'::public.clarity_change_proposal_status,
    v_result_daily_action_id, null::text;
end;
$$;

revoke all on function private.clarity_action_create_payload_fingerprint_v1(
  text, date, date, time without time zone, integer
) from public, anon, authenticated;

revoke all on function public.append_clarity_response_v3(
  uuid, text, text, text, text, jsonb, integer, integer, integer,
  public.clarity_change_proposal_type, uuid, text, date, text, text,
  text, date, date, time without time zone, integer
) from public, anon, authenticated;
revoke all on function public.edit_clarity_action_create_proposal_v1(
  uuid, integer, text, date, time without time zone, integer
) from public, anon, authenticated;
revoke all on function public.execute_clarity_action_create_proposal_v1(uuid)
  from public, anon, authenticated;

grant execute on function public.append_clarity_response_v3(
  uuid, text, text, text, text, jsonb, integer, integer, integer,
  public.clarity_change_proposal_type, uuid, text, date, text, text,
  text, date, date, time without time zone, integer
) to authenticated;
grant execute on function public.edit_clarity_action_create_proposal_v1(
  uuid, integer, text, date, time without time zone, integer
) to authenticated;
grant execute on function public.execute_clarity_action_create_proposal_v1(uuid)
  to authenticated;

comment on table public.clarity_action_create_proposals is
  'Typed, owner-scoped Action creation payloads for Clarity Proposal Layer V1 Slice B.';

notify pgrst, 'reload schema';
