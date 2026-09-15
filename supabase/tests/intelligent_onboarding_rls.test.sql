begin;

select plan(18);

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
    '91000000-0000-0000-0000-000000000001',
    'onboarding-a@example.test',
    'authenticated',
    'authenticated',
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '91000000-0000-0000-0000-000000000002',
    'onboarding-b@example.test',
    'authenticated',
    'authenticated',
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '91000000-0000-0000-0000-000000000001',
  true
);

select lives_ok(
  $$
    select *
    from public.append_onboarding_user_message_v1(
      'My schedule is fragmented and I want more control of my time.'
    )
  $$,
  'an authenticated owner can start onboarding with a normal message'
);

select is(
  (select count(*) from public.onboarding_sessions where status = 'in_progress'),
  1::bigint,
  'the first answer creates one owned in-progress session'
);

select is(
  (select count(*) from public.onboarding_messages where role = 'user'),
  1::bigint,
  'the owner can read the persisted user answer'
);

reset role;
insert into public.clarity_message_attachments (
  id,
  user_id,
  kind,
  storage_path,
  mime_type,
  byte_size,
  transcription_status
)
values
  (
    '92000000-0000-0000-0000-000000000001',
    '91000000-0000-0000-0000-000000000001',
    'image',
    '91000000-0000-0000-0000-000000000001/92000000-0000-0000-0000-000000000001.jpg',
    'image/jpeg',
    1024,
    'not_applicable'
  ),
  (
    '92000000-0000-0000-0000-000000000002',
    '91000000-0000-0000-0000-000000000002',
    'image',
    '91000000-0000-0000-0000-000000000002/92000000-0000-0000-0000-000000000002.jpg',
    'image/jpeg',
    1024,
    'not_applicable'
  );

insert into storage.objects (bucket_id, name)
values
  (
    'clarity-media',
    '91000000-0000-0000-0000-000000000001/92000000-0000-0000-0000-000000000001.jpg'
  ),
  (
    'clarity-media',
    '91000000-0000-0000-0000-000000000002/92000000-0000-0000-0000-000000000002.jpg'
  );

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '91000000-0000-0000-0000-000000000001',
  true
);

select lives_ok(
  $$
    select *
    from public.append_onboarding_user_message_v2(
      'This photo shows what my days currently look like.',
      array['92000000-0000-0000-0000-000000000001'::uuid]
    )
  $$,
  'the owner can atomically persist an onboarding message with an owned image'
);

select is(
  (
    select count(*)
    from public.clarity_message_attachments
    where id = '92000000-0000-0000-0000-000000000001'
      and message_id is null
      and onboarding_message_id is not null
  ),
  1::bigint,
  'the image is claimed by exactly the onboarding message target'
);

select is(
  (
    select content
    from public.onboarding_messages
    where id = (
      select onboarding_message_id
      from public.clarity_message_attachments
      where id = '92000000-0000-0000-0000-000000000001'
    )
  ),
  'This photo shows what my days currently look like.',
  'the attachment reloads with the same durable onboarding user message'
);

select throws_ok(
  $$
    select public.discard_clarity_draft_attachment_v1(
      '92000000-0000-0000-0000-000000000001'
    )
  $$,
  'P0002',
  'Draft attachment not found.',
  'a claimed onboarding image cannot be discarded as a draft'
);

select throws_ok(
  $$
    select *
    from public.append_onboarding_user_message_v2(
      '',
      array['92000000-0000-0000-0000-000000000002'::uuid]
    )
  $$,
  'P0002',
  'Attachment is unavailable.',
  'an owner cannot claim another user image into onboarding'
);

select throws_ok(
  $$
    insert into public.onboarding_messages (
      onboarding_session_id,
      user_id,
      role,
      content
    )
    select
      id,
      '91000000-0000-0000-0000-000000000001',
      'user',
      'Direct write'
    from public.onboarding_sessions
    limit 1
  $$,
  '42501',
  null,
  'authenticated clients cannot bypass the onboarding RPCs'
);

select lives_ok(
  $$
    select *
    from public.append_onboarding_response_v1(
      (
        select id
        from public.onboarding_messages
        where role = 'user'
        limit 1
      ),
      'The fragmented schedule looks like the immediate constraint. What would you want a normal week to feel like?',
      'CLARIFY',
      jsonb_build_object(
        'understanding', jsonb_build_object('currentReality', jsonb_build_array()),
        'progress', jsonb_build_object('readyForConfirmation', false),
        'unknowns', jsonb_build_array(),
        'insights', jsonb_build_array(),
        'routes', jsonb_build_array(),
        'readiness', jsonb_build_object('readyForSynthesis', false),
        'synthesis', null
      ),
      'test-provider',
      'test-model',
      20,
      30,
      15
    )
  $$,
  'the owned response RPC persists concise structured artifacts'
);

select is(
  (select turn_count from public.onboarding_sessions where status = 'in_progress'),
  1,
  'a completed assistant turn advances the durable turn count once'
);

select set_config(
  'test.onboarding_session_id',
  (select id::text from public.onboarding_sessions where status = 'in_progress'),
  true
);

select set_config(
  'request.jwt.claim.sub',
  '91000000-0000-0000-0000-000000000002',
  true
);

select is(
  (select count(*) from public.onboarding_sessions),
  0::bigint,
  'another authenticated user cannot read the session'
);

select is(
  (select count(*) from public.onboarding_messages),
  0::bigint,
  'another authenticated user cannot read the messages'
);

select is(
  (
    select count(*)
    from public.clarity_message_attachments
    where id = '92000000-0000-0000-0000-000000000001'
  ),
  0::bigint,
  'another authenticated user cannot read the owner onboarding image metadata'
);

select throws_ok(
  format(
    'select public.confirm_onboarding_understanding_v1(%L)',
    current_setting('test.onboarding_session_id')
  ),
  'P0002',
  'Onboarding session not found.',
  'another authenticated user cannot confirm the owner session'
);

reset role;
update public.onboarding_sessions
set
  progress = '{"readyForConfirmation":true}'::jsonb,
  synthesis = '{"whereYouAre":"A grounded starting point"}'::jsonb
where user_id = '91000000-0000-0000-0000-000000000001';

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '91000000-0000-0000-0000-000000000001',
  true
);

select lives_ok(
  $$
    select public.confirm_onboarding_understanding_v1(
      (
        select id
        from public.onboarding_sessions
        where status = 'in_progress'
      )
    )
  $$,
  'the owner can explicitly confirm a ready synthesis'
);

select is(
  (select status::text from public.onboarding_sessions where status = 'completed'),
  'completed',
  'confirmation completes the same onboarding session'
);

select ok(
  (
    select onboarding_completed and confirmed_snapshot is not null
    from public.profiles
    join public.onboarding_sessions
      on onboarding_sessions.user_id = profiles.id
    where profiles.id = '91000000-0000-0000-0000-000000000001'
  ),
  'confirmation freezes a snapshot and completes the profile onboarding flag'
);

select * from finish();
rollback;
