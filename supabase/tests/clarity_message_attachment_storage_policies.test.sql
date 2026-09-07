begin;

select plan(12);

insert into auth.users (
  id,
  email,
  aud,
  role,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '81000000-0000-0000-0000-000000000001',
    'clarity-media-a@example.test',
    'authenticated',
    'authenticated',
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '81000000-0000-0000-0000-000000000002',
    'clarity-media-b@example.test',
    'authenticated',
    'authenticated',
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

insert into public.clarity_conversations (id, user_id)
values (
  '82000000-0000-0000-0000-000000000001',
  '81000000-0000-0000-0000-000000000001'
);

insert into public.clarity_messages (
  id,
  conversation_id,
  user_id,
  role,
  content,
  invocation_type
)
values (
  '83000000-0000-0000-0000-000000000001',
  '82000000-0000-0000-0000-000000000001',
  '81000000-0000-0000-0000-000000000001',
  'user',
  'Persisted attachment policy fixture',
  'general'
);

insert into public.clarity_message_attachments (
  id,
  user_id,
  message_id,
  kind,
  storage_path,
  mime_type,
  byte_size,
  transcription_status,
  position
)
values
  (
    '84000000-0000-0000-0000-000000000001',
    '81000000-0000-0000-0000-000000000001',
    null,
    'image',
    '81000000-0000-0000-0000-000000000001/84000000-0000-0000-0000-000000000001.jpg',
    'image/jpeg',
    1024,
    'not_applicable',
    null
  ),
  (
    '84000000-0000-0000-0000-000000000002',
    '81000000-0000-0000-0000-000000000001',
    null,
    'image',
    '81000000-0000-0000-0000-000000000001/84000000-0000-0000-0000-000000000002.jpg',
    'image/jpeg',
    1024,
    'not_applicable',
    null
  ),
  (
    '84000000-0000-0000-0000-000000000003',
    '81000000-0000-0000-0000-000000000001',
    '83000000-0000-0000-0000-000000000001',
    'image',
    '81000000-0000-0000-0000-000000000001/84000000-0000-0000-0000-000000000003.jpg',
    'image/jpeg',
    1024,
    'not_applicable',
    0
  ),
  (
    '84000000-0000-0000-0000-000000000004',
    '81000000-0000-0000-0000-000000000002',
    null,
    'image',
    '81000000-0000-0000-0000-000000000002/84000000-0000-0000-0000-000000000004.jpg',
    'image/jpeg',
    1024,
    'not_applicable',
    null
  );

-- Persisted and foreign objects already exist before the authenticated checks.
insert into storage.objects (bucket_id, name)
values
  (
    'clarity-media',
    '81000000-0000-0000-0000-000000000001/84000000-0000-0000-0000-000000000003.jpg'
  ),
  (
    'clarity-media',
    '81000000-0000-0000-0000-000000000002/84000000-0000-0000-0000-000000000004.jpg'
  );

-- Storage protects its metadata tables from direct SQL deletion. The product
-- correctly deletes through the Storage API; this transaction disables only
-- that trigger path so pgTAP can exercise the DELETE RLS predicate itself.
set local session_replication_role = replica;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '81000000-0000-0000-0000-000000000001',
  true
);

select lives_ok(
  $$
    insert into storage.objects (bucket_id, name)
    values (
      'clarity-media',
      '81000000-0000-0000-0000-000000000001/84000000-0000-0000-0000-000000000001.jpg'
    )
  $$,
  'owner can upload the exact object for an owned draft attachment'
);

select throws_ok(
  $$
    insert into storage.objects (bucket_id, name)
    values (
      'clarity-media',
      '81000000-0000-0000-0000-000000000001/85000000-0000-0000-0000-000000000001.jpg'
    )
  $$,
  '42501',
  null,
  'an owner folder alone cannot authorize an arbitrary upload'
);

select throws_ok(
  $$
    insert into storage.objects (bucket_id, name)
    values (
      'clarity-media',
      '81000000-0000-0000-0000-000000000001/84000000-0000-0000-0000-000000000002.png'
    )
  $$,
  '42501',
  null,
  'a path cannot impersonate owned attachment metadata with a different extension'
);

select throws_ok(
  $$
    insert into storage.objects (bucket_id, name)
    values (
      'clarity-media',
      '81000000-0000-0000-0000-000000000002/84000000-0000-0000-0000-000000000004.jpg'
    )
  $$,
  '42501',
  null,
  'an owner cannot upload against another user attachment'
);

select is(
  (
    select count(*)
    from storage.objects
    where bucket_id = 'clarity-media'
      and name = '81000000-0000-0000-0000-000000000001/84000000-0000-0000-0000-000000000001.jpg'
  ),
  1::bigint,
  'owner can read their valid draft object'
);

select is(
  (
    select count(*)
    from storage.objects
    where bucket_id = 'clarity-media'
      and name = '81000000-0000-0000-0000-000000000001/84000000-0000-0000-0000-000000000003.jpg'
  ),
  1::bigint,
  'owner can read their persisted message object'
);

select is(
  (
    select count(*)
    from storage.objects
    where bucket_id = 'clarity-media'
      and name = '81000000-0000-0000-0000-000000000002/84000000-0000-0000-0000-000000000004.jpg'
  ),
  0::bigint,
  'owner cannot read another user object'
);

select throws_ok(
  $$
    insert into storage.objects (bucket_id, name)
    values (
      'clarity-media',
      '81000000-0000-0000-0000-000000000001/nested/84000000-0000-0000-0000-000000000002.jpg'
    )
  $$,
  '42501',
  null,
  'malformed nested paths are rejected'
);

select results_eq(
  $$
    delete from storage.objects
    where bucket_id = 'clarity-media'
      and name = '81000000-0000-0000-0000-000000000001/84000000-0000-0000-0000-000000000001.jpg'
    returning 1
  $$,
  $$ values (1) $$,
  'owner can delete an owned unattached draft object'
);

select is(
  (
    select count(*)
    from storage.objects
    where bucket_id = 'clarity-media'
      and name = '81000000-0000-0000-0000-000000000001/84000000-0000-0000-0000-000000000001.jpg'
  ),
  0::bigint,
  'deleted draft object is no longer visible'
);

select is_empty(
  $$
    delete from storage.objects
    where bucket_id = 'clarity-media'
      and name = '81000000-0000-0000-0000-000000000001/84000000-0000-0000-0000-000000000003.jpg'
    returning 1
  $$,
  'owner cannot directly delete media attached to a persisted message'
);

select is_empty(
  $$
    delete from storage.objects
    where bucket_id = 'clarity-media'
      and name = '81000000-0000-0000-0000-000000000002/84000000-0000-0000-0000-000000000004.jpg'
    returning 1
  $$,
  'owner cannot delete another user media object'
);

select * from finish();
rollback;
