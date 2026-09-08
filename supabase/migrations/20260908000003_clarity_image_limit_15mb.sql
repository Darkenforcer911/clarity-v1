alter table public.clarity_message_attachments
  drop constraint clarity_message_attachments_size_check;

alter table public.clarity_message_attachments
  add constraint clarity_message_attachments_size_check check (
    (kind = 'image' and byte_size between 1 and 15728640)
    or
    (kind = 'audio' and byte_size between 1 and 15728640)
  );

create or replace function public.create_clarity_attachment_v1(
  p_kind text,
  p_mime_type text,
  p_byte_size integer,
  p_width integer default null,
  p_height integer default null,
  p_duration_ms integer default null
)
returns table (
  attachment_id uuid,
  storage_path text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_attachment_id uuid := gen_random_uuid();
  v_extension text;
  v_storage_path text;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if p_kind = 'image' then
    v_extension := case p_mime_type
      when 'image/jpeg' then 'jpg'
      when 'image/png' then 'png'
      when 'image/webp' then 'webp'
      when 'image/gif' then 'gif'
      else null
    end;
    if v_extension is null or p_byte_size not between 1 and 15728640
      or (p_width is null) <> (p_height is null)
      or p_width is not null and (p_width not between 1 and 12000 or p_height not between 1 and 12000)
      or p_duration_ms is not null then
      raise exception 'Invalid image attachment.' using errcode = '22023';
    end if;
  elsif p_kind = 'audio' then
    v_extension := case p_mime_type
      when 'audio/mpeg' then 'mp3'
      when 'audio/mp3' then 'mp3'
      when 'audio/mp4' then 'm4a'
      when 'audio/m4a' then 'm4a'
      when 'audio/x-m4a' then 'm4a'
      when 'audio/wav' then 'wav'
      when 'audio/webm' then 'webm'
      when 'audio/ogg' then 'ogg'
      else null
    end;
    if v_extension is null or p_byte_size not between 1 and 15728640
      or p_duration_ms is null or p_duration_ms not between 1 and 300000
      or p_width is not null or p_height is not null then
      raise exception 'Invalid audio attachment.' using errcode = '22023';
    end if;
  else
    raise exception 'Unsupported attachment kind.' using errcode = '22023';
  end if;

  v_storage_path := format('%s/%s.%s', v_user_id, v_attachment_id, v_extension);

  insert into public.clarity_message_attachments (
    id,
    user_id,
    kind,
    storage_path,
    mime_type,
    byte_size,
    width,
    height,
    duration_ms,
    transcription_status
  ) values (
    v_attachment_id,
    v_user_id,
    p_kind,
    v_storage_path,
    p_mime_type,
    p_byte_size,
    p_width,
    p_height,
    p_duration_ms,
    case when p_kind = 'audio' then 'pending' else 'not_applicable' end
  );

  return query select v_attachment_id, v_storage_path;
end;
$$;

create or replace function public.append_clarity_user_message_v2(
  p_content text,
  p_invocation_type text default 'general',
  p_subject_action_id uuid default null,
  p_subject_calendar_commitment_id uuid default null,
  p_subject_local_date date default null,
  p_attachment_ids uuid[] default array[]::uuid[]
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
  v_attachment_count integer;
  v_audio_count integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  p_content := btrim(coalesce(p_content, ''));
  p_attachment_ids := coalesce(p_attachment_ids, array[]::uuid[]);

  if char_length(p_content) > 8000
    or (char_length(p_content) = 0 and cardinality(p_attachment_ids) = 0) then
    raise exception 'Message must contain text or an attachment.' using errcode = '22023';
  end if;
  if cardinality(p_attachment_ids) > 3
    or array_position(p_attachment_ids, null) is not null
    or cardinality(p_attachment_ids) <> (
      select count(distinct attachment_id)
      from unnest(p_attachment_ids) as item(attachment_id)
    ) then
    raise exception 'Invalid attachment set.' using errcode = '22023';
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
      select 1
      from public.calendar_commitments as commitment
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
          or (commitment.status <> 'scheduled' and commitment.local_date = p_subject_local_date)
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

  perform attachment.id
  from public.clarity_message_attachments as attachment
  where attachment.id = any(p_attachment_ids)
    and attachment.user_id = v_user_id
  order by attachment.id
  for update;

  select
    count(*),
    count(*) filter (where attachment.kind = 'audio')
  into v_attachment_count, v_audio_count
  from public.clarity_message_attachments as attachment
  where attachment.id = any(p_attachment_ids)
    and attachment.user_id = v_user_id
    and attachment.message_id is null;

  if v_attachment_count <> cardinality(p_attachment_ids)
    or v_audio_count > 1
    or (v_audio_count = 1 and v_attachment_count <> 1) then
    raise exception 'Attachment is unavailable.' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.clarity_message_attachments as attachment
    where attachment.id = any(p_attachment_ids)
      and attachment.user_id = v_user_id
      and not exists (
        select 1
        from storage.objects as object
        where object.bucket_id = 'clarity-media'
          and object.name = attachment.storage_path
      )
  ) then
    raise exception 'Attachment upload is incomplete.' using errcode = '22023';
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
    p_content,
    p_invocation_type,
    p_subject_action_id,
    p_subject_calendar_commitment_id,
    p_subject_local_date
  )
  returning id, clarity_messages.created_at into v_message_id, v_created_at;

  update public.clarity_message_attachments as attachment
  set
    message_id = v_message_id,
    position = ordered.position::smallint,
    updated_at = now()
  from (
    select attachment_id, ordinality - 1 as position
    from unnest(p_attachment_ids) with ordinality as item(attachment_id, ordinality)
  ) as ordered
  where attachment.id = ordered.attachment_id
    and attachment.user_id = v_user_id
    and attachment.message_id is null;

  update public.clarity_conversations
  set last_message_at = v_created_at
  where id = v_conversation_id and user_id = v_user_id;

  return query select v_message_id, v_conversation_id, v_created_at;
end;
$$;

revoke all on function public.create_clarity_attachment_v1(text, text, integer, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.create_clarity_attachment_v1(text, text, integer, integer, integer, integer)
  to authenticated;
revoke all on function public.append_clarity_user_message_v2(text, text, uuid, uuid, date, uuid[])
  from public, anon, authenticated;
grant execute on function public.append_clarity_user_message_v2(text, text, uuid, uuid, date, uuid[])
  to authenticated;

notify pgrst, 'reload schema';
