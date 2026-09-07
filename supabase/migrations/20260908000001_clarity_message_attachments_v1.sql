alter table public.clarity_messages
  drop constraint clarity_messages_content_length;

alter table public.clarity_messages
  add constraint clarity_messages_content_length check (
    (role = 'user' and char_length(content) <= 8000)
    or
    (role = 'clarity' and char_length(btrim(content)) between 1 and 8000)
  ),
  add constraint clarity_messages_id_user_unique unique (id, user_id);

create table public.clarity_message_attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  message_id uuid,
  kind text not null,
  storage_path text not null unique,
  mime_type text not null,
  byte_size integer not null,
  width integer,
  height integer,
  duration_ms integer,
  transcript text,
  transcription_status text not null,
  position smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clarity_message_attachments_message_owner_fkey
    foreign key (message_id, user_id)
    references public.clarity_messages(id, user_id)
    on delete cascade,
  constraint clarity_message_attachments_kind_check
    check (kind in ('image', 'audio')),
  constraint clarity_message_attachments_path_length_check
    check (char_length(storage_path) between 1 and 500),
  constraint clarity_message_attachments_mime_check check (
    (kind = 'image' and mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/gif'))
    or
    (kind = 'audio' and mime_type in (
      'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/m4a',
      'audio/x-m4a', 'audio/wav', 'audio/webm', 'audio/ogg'
    ))
  ),
  constraint clarity_message_attachments_size_check check (
    (kind = 'image' and byte_size between 1 and 8388608)
    or
    (kind = 'audio' and byte_size between 1 and 15728640)
  ),
  constraint clarity_message_attachments_dimensions_check check (
    (kind = 'image'
      and ((width is null and height is null)
        or (width is not null and height is not null
          and width between 1 and 12000 and height between 1 and 12000)))
    or
    (kind = 'audio' and width is null and height is null)
  ),
  constraint clarity_message_attachments_duration_check check (
    (kind = 'image' and duration_ms is null)
    or
    (kind = 'audio' and duration_ms between 1 and 300000)
  ),
  constraint clarity_message_attachments_transcription_check check (
    (kind = 'image'
      and transcription_status = 'not_applicable'
      and transcript is null)
    or
    (kind = 'audio'
      and transcription_status in ('pending', 'complete', 'failed')
      and (
        (transcription_status = 'complete'
          and transcript is not null
          and char_length(btrim(transcript)) between 1 and 8000)
        or
        (transcription_status <> 'complete' and transcript is null)
      ))
  ),
  constraint clarity_message_attachments_position_check check (
    (message_id is null and position is null)
    or
    (message_id is not null and position is not null and position between 0 and 3)
  )
);

create unique index clarity_message_attachments_message_position_idx
  on public.clarity_message_attachments (message_id, position)
  where message_id is not null;

create index clarity_message_attachments_owner_message_idx
  on public.clarity_message_attachments (user_id, message_id, position);

alter table public.clarity_message_attachments enable row level security;
alter table public.clarity_message_attachments force row level security;

create policy "Users can read their Clarity message attachments"
on public.clarity_message_attachments
for select
to authenticated
using (user_id = (select auth.uid()));

revoke all on table public.clarity_message_attachments from public, anon, authenticated;
grant select on table public.clarity_message_attachments to authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'clarity-media',
  'clarity-media',
  false,
  15728640,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/m4a',
    'audio/x-m4a', 'audio/wav', 'audio/webm', 'audio/ogg'
  ]
);

create policy "Users can upload their own Clarity media"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'clarity-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and cardinality(storage.foldername(name)) = 1
  and exists (
    select 1
    from public.clarity_message_attachments as attachment
    where attachment.user_id = (select auth.uid())
      and attachment.message_id is null
      and (
        (attachment.kind = 'image'
          and attachment.transcription_status = 'not_applicable'
          and attachment.transcript is null)
        or
        (attachment.kind = 'audio'
          and attachment.transcription_status = 'pending'
          and attachment.transcript is null)
      )
      and attachment.storage_path = name
      and attachment.storage_path = concat(
        attachment.user_id::text,
        '/',
        attachment.id::text,
        case attachment.mime_type
          when 'image/jpeg' then '.jpg'
          when 'image/png' then '.png'
          when 'image/webp' then '.webp'
          when 'image/gif' then '.gif'
          when 'audio/mpeg' then '.mp3'
          when 'audio/mp3' then '.mp3'
          when 'audio/mp4' then '.m4a'
          when 'audio/m4a' then '.m4a'
          when 'audio/x-m4a' then '.m4a'
          when 'audio/wav' then '.wav'
          when 'audio/webm' then '.webm'
          when 'audio/ogg' then '.ogg'
        end
      )
  )
);

create policy "Users can read their own Clarity media"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'clarity-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and cardinality(storage.foldername(name)) = 1
  and exists (
    select 1
    from public.clarity_message_attachments as attachment
    where attachment.user_id = (select auth.uid())
      and attachment.storage_path = name
      and attachment.storage_path = concat(
        attachment.user_id::text,
        '/',
        attachment.id::text,
        case attachment.mime_type
          when 'image/jpeg' then '.jpg'
          when 'image/png' then '.png'
          when 'image/webp' then '.webp'
          when 'image/gif' then '.gif'
          when 'audio/mpeg' then '.mp3'
          when 'audio/mp3' then '.mp3'
          when 'audio/mp4' then '.m4a'
          when 'audio/m4a' then '.m4a'
          when 'audio/x-m4a' then '.m4a'
          when 'audio/wav' then '.wav'
          when 'audio/webm' then '.webm'
          when 'audio/ogg' then '.ogg'
        end
      )
  )
);

create policy "Users can delete their own Clarity media"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'clarity-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and cardinality(storage.foldername(name)) = 1
  and exists (
    select 1
    from public.clarity_message_attachments as attachment
    where attachment.user_id = (select auth.uid())
      and attachment.message_id is null
      and attachment.storage_path = name
      and attachment.storage_path = concat(
        attachment.user_id::text,
        '/',
        attachment.id::text,
        case attachment.mime_type
          when 'image/jpeg' then '.jpg'
          when 'image/png' then '.png'
          when 'image/webp' then '.webp'
          when 'image/gif' then '.gif'
          when 'audio/mpeg' then '.mp3'
          when 'audio/mp3' then '.mp3'
          when 'audio/mp4' then '.m4a'
          when 'audio/m4a' then '.m4a'
          when 'audio/x-m4a' then '.m4a'
          when 'audio/wav' then '.wav'
          when 'audio/webm' then '.webm'
          when 'audio/ogg' then '.ogg'
        end
      )
  )
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
    if v_extension is null or p_byte_size not between 1 and 8388608
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
  if cardinality(p_attachment_ids) > 4
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

create or replace function public.complete_clarity_audio_transcription_v1(
  p_attachment_id uuid,
  p_transcript text
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
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if p_transcript is null or char_length(btrim(p_transcript)) not between 1 and 8000 then
    raise exception 'Invalid audio transcript.' using errcode = '22023';
  end if;

  update public.clarity_message_attachments
  set
    transcript = btrim(p_transcript),
    transcription_status = 'complete',
    updated_at = now()
  where id = p_attachment_id
    and user_id = v_user_id
    and kind = 'audio'
    and message_id is not null
    and transcription_status in ('pending', 'failed');

  if not found then
    raise exception 'Audio attachment not found.' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.fail_clarity_audio_transcription_v1(
  p_attachment_id uuid
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
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  update public.clarity_message_attachments
  set
    transcript = null,
    transcription_status = 'failed',
    updated_at = now()
  where id = p_attachment_id
    and user_id = v_user_id
    and kind = 'audio'
    and message_id is not null
    and transcription_status in ('pending', 'failed');

  if not found then
    raise exception 'Audio attachment not found.' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.discard_clarity_draft_attachment_v1(
  p_attachment_id uuid
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
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  delete from public.clarity_message_attachments
  where id = p_attachment_id
    and user_id = v_user_id
    and message_id is null;

  if not found then
    raise exception 'Draft attachment not found.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.create_clarity_attachment_v1(text, text, integer, integer, integer, integer)
  from public, anon, authenticated;
revoke all on function public.append_clarity_user_message_v2(text, text, uuid, uuid, date, uuid[])
  from public, anon, authenticated;
revoke all on function public.complete_clarity_audio_transcription_v1(uuid, text)
  from public, anon, authenticated;
revoke all on function public.fail_clarity_audio_transcription_v1(uuid)
  from public, anon, authenticated;
revoke all on function public.discard_clarity_draft_attachment_v1(uuid)
  from public, anon, authenticated;

grant execute on function public.create_clarity_attachment_v1(text, text, integer, integer, integer, integer)
  to authenticated;
grant execute on function public.append_clarity_user_message_v2(text, text, uuid, uuid, date, uuid[])
  to authenticated;
grant execute on function public.complete_clarity_audio_transcription_v1(uuid, text)
  to authenticated;
grant execute on function public.fail_clarity_audio_transcription_v1(uuid)
  to authenticated;
grant execute on function public.discard_clarity_draft_attachment_v1(uuid)
  to authenticated;

comment on table public.clarity_message_attachments is
  'Private owner-scoped media attached to the single persistent Clarity conversation. Media is conversational evidence, not canonical Life truth.';

notify pgrst, 'reload schema';
