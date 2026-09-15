alter table public.onboarding_messages
  add constraint onboarding_messages_id_user_unique unique (id, user_id),
  drop constraint onboarding_messages_content_length,
  add constraint onboarding_messages_content_length check (
    (role = 'user' and char_length(content) <= 10000)
    or
    (role = 'clarity' and char_length(btrim(content)) between 1 and 10000)
  );

alter table public.clarity_message_attachments
  add column onboarding_message_id uuid,
  add constraint clarity_message_attachments_onboarding_message_owner_fkey
    foreign key (onboarding_message_id, user_id)
    references public.onboarding_messages(id, user_id)
    on delete cascade,
  drop constraint clarity_message_attachments_position_check,
  add constraint clarity_message_attachments_position_check check (
    (
      message_id is null
      and onboarding_message_id is null
      and position is null
    )
    or
    (
      num_nonnulls(message_id, onboarding_message_id) = 1
      and position between 0 and 3
    )
  );

create unique index clarity_message_attachments_onboarding_message_position_idx
  on public.clarity_message_attachments (onboarding_message_id, position)
  where onboarding_message_id is not null;

create index clarity_message_attachments_owner_onboarding_message_idx
  on public.clarity_message_attachments (user_id, onboarding_message_id, position);

create function public.append_onboarding_user_message_v2(
  p_content text,
  p_attachment_ids uuid[] default array[]::uuid[]
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
  v_attachment_count integer;
  v_claimed_count integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  p_content := btrim(coalesce(p_content, ''));
  p_attachment_ids := coalesce(p_attachment_ids, array[]::uuid[]);

  if char_length(p_content) > 10000
    or (char_length(p_content) = 0 and cardinality(p_attachment_ids) = 0) then
    raise exception 'Message must contain text or an image.' using errcode = '22023';
  end if;
  if cardinality(p_attachment_ids) > 3
    or array_position(p_attachment_ids, null) is not null
    or cardinality(p_attachment_ids) <> (
      select count(distinct attachment_id)
      from unnest(p_attachment_ids) as item(attachment_id)
    ) then
    raise exception 'Invalid attachment set.' using errcode = '22023';
  end if;

  perform attachment.id
  from public.clarity_message_attachments as attachment
  where attachment.id = any(p_attachment_ids)
    and attachment.user_id = v_user_id
  order by attachment.id
  for update;

  select count(*)
  into v_attachment_count
  from public.clarity_message_attachments as attachment
  where attachment.id = any(p_attachment_ids)
    and attachment.user_id = v_user_id
    and attachment.message_id is null
    and attachment.onboarding_message_id is null
    and attachment.kind = 'image';

  if v_attachment_count <> cardinality(p_attachment_ids) then
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
    p_content
  )
  returning id, onboarding_messages.created_at
  into v_message_id, v_created_at;

  update public.clarity_message_attachments as attachment
  set
    onboarding_message_id = v_message_id,
    position = ordered.position::smallint,
    updated_at = now()
  from (
    select attachment_id, ordinality - 1 as position
    from unnest(p_attachment_ids) with ordinality as item(attachment_id, ordinality)
  ) as ordered
  where attachment.id = ordered.attachment_id
    and attachment.user_id = v_user_id
    and attachment.message_id is null
    and attachment.onboarding_message_id is null;

  get diagnostics v_claimed_count = row_count;
  if v_claimed_count <> cardinality(p_attachment_ids) then
    raise exception 'Attachment claim failed.' using errcode = 'P0002';
  end if;

  return query select v_message_id, v_session_id, v_created_at;
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
    and message_id is null
    and onboarding_message_id is null;

  if not found then
    raise exception 'Draft attachment not found.' using errcode = 'P0002';
  end if;
end;
$$;

alter policy "Users can upload their own Clarity media"
on storage.objects
with check (
  bucket_id = 'clarity-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and cardinality(storage.foldername(name)) = 1
  and exists (
    select 1
    from public.clarity_message_attachments as attachment
    where attachment.user_id = (select auth.uid())
      and attachment.message_id is null
      and attachment.onboarding_message_id is null
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

alter policy "Users can delete their own Clarity media"
on storage.objects
using (
  bucket_id = 'clarity-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and cardinality(storage.foldername(name)) = 1
  and exists (
    select 1
    from public.clarity_message_attachments as attachment
    where attachment.user_id = (select auth.uid())
      and attachment.message_id is null
      and attachment.onboarding_message_id is null
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

revoke all on function public.append_onboarding_user_message_v2(text, uuid[])
  from public, anon, authenticated;
grant execute on function public.append_onboarding_user_message_v2(text, uuid[])
  to authenticated;

notify pgrst, 'reload schema';
