begin;

select no_plan();

insert into auth.users (
  id, email, aud, role, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
values
  (
    '71000000-0000-4000-8000-000000000001',
    'action-proposal-a@example.test',
    'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '71000000-0000-4000-8000-000000000002',
    'action-proposal-b@example.test',
    'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now()
  );

update public.profiles
set name = case id
    when '71000000-0000-4000-8000-000000000001' then 'Action A'
    else 'Action B'
  end,
  timezone = 'Australia/Melbourne'
where id in (
  '71000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000002'
);

insert into public.daily_plans (
  id, user_id, local_date, status, woke_at, aiming_to_sleep_at,
  focus, proposed_at, approved_at
)
values (
  '72000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000001',
  (clock_timestamp() at time zone 'Australia/Melbourne')::date,
  'active', now() - interval '4 hours', now() + interval '10 hours',
  'Test Action proposals', now() - interval '3 hours', now() - interval '2 hours'
);

insert into public.clarity_conversations (id, user_id)
values
  ('73000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001'),
  ('73000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000002');

insert into public.clarity_messages (
  id, conversation_id, user_id, role, content, created_at
)
select
  ('74000000-0000-4000-8000-' || lpad(item.ordinality::text, 12, '0'))::uuid,
  '73000000-0000-4000-8000-000000000001'::uuid,
  '71000000-0000-4000-8000-000000000001'::uuid,
  'user', item.content,
  now() - make_interval(mins => 20 - item.ordinality::integer)
from unnest(array[
  'Call the recruiter tomorrow',
  'Book a haircut',
  'Prepare interview notes',
  'Prepare interview notes again',
  'Actually book the haircut',
  'Create an invalid past Action'
]) with ordinality as item(content, ordinality);

insert into public.clarity_messages (
  id, conversation_id, user_id, role, content, created_at
)
values (
  '74000000-0000-4000-8000-000000000101',
  '73000000-0000-4000-8000-000000000002',
  '71000000-0000-4000-8000-000000000002',
  'user', 'Foreign source', now()
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '71000000-0000-4000-8000-000000000001',
  true
);

create temp table action_proposal_test_ids (
  label text primary key,
  proposal_id uuid,
  response_id uuid,
  result_action_id uuid
);

insert into action_proposal_test_ids (label, proposal_id, response_id)
select 'execute', response.proposal_id, response.message_id
from public.append_clarity_response_v3(
  p_user_message_id => '74000000-0000-4000-8000-000000000001',
  p_content => 'I can add that when you confirm.',
  p_model_provider => 'test',
  p_model_version => 'test-model',
  p_next_move_type => 'recommend',
  p_structured_metadata => '{}'::jsonb,
  p_latency_ms => 1,
  p_proposal_type => 'action_create',
  p_proposal_summary => 'Call the recruiter',
  p_proposal_rationale => 'The user chose this concrete next step.',
  p_action_title => 'Call the recruiter',
  p_action_local_date => (clock_timestamp() at time zone 'Australia/Melbourne')::date,
  p_action_due_local_date => (clock_timestamp() at time zone 'Australia/Melbourne')::date + 1,
  p_action_estimated_minutes => 20
) as response;

select isnt(
  (select proposal_id from action_proposal_test_ids where label = 'execute'),
  null::uuid,
  'a valid provider candidate persists one typed Action proposal'
);

select is(
  (
    select count(*)
    from public.daily_actions
    where user_id = '71000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'provider output alone cannot create an Action'
);

select is(
  (
    select count(*)
    from public.clarity_action_create_proposals as detail
    join public.clarity_change_proposals as proposal
      on proposal.id = detail.proposal_id
     and proposal.user_id = detail.user_id
    where proposal.id = (
      select proposal_id from action_proposal_test_ids where label = 'execute'
    )
      and proposal.source_assistant_message_id = (
        select response_id from action_proposal_test_ids where label = 'execute'
      )
      and proposal.proposal_type = 'action_create'
  ),
  1::bigint,
  'assistant response and typed Action detail persist atomically'
);

select is(
  (
    select revision
    from public.edit_clarity_action_create_proposal_v1(
      (select proposal_id from action_proposal_test_ids where label = 'execute'),
      1,
      'Call the recruiter and confirm next steps',
      (clock_timestamp() at time zone 'Australia/Melbourne')::date + 2,
      '14:30',
      45
    )
  ),
  2,
  'Edit persists only safe typed Action fields and advances the revision'
);

select throws_ok(
  format(
    'select * from public.edit_clarity_action_create_proposal_v1(%L, 1, %L, null, null, null)',
    (select proposal_id from action_proposal_test_ids where label = 'execute'),
    'Stale edit'
  ),
  '40001',
  'This proposal changed. Reload it before editing.',
  'Edit preserves optimistic revision checking'
);

insert into action_proposal_test_ids (label, proposal_id, result_action_id)
select 'executed_result', result.proposal_id, result.result_daily_action_id
from public.execute_clarity_action_create_proposal_v1(
  (select proposal_id from action_proposal_test_ids where label = 'execute')
) as result;

select is(
  (
    select status::text
    from public.clarity_change_proposals
    where id = (select proposal_id from action_proposal_test_ids where label = 'execute')
  ),
  'executed',
  'Confirm marks the proposal executed'
);

select is(
  (
    select concat_ws('|',
      action.title,
      action.local_date::text,
      action.due_local_date::text,
      to_char(action.due_local_time, 'HH24:MI'),
      action.estimated_minutes::text,
      action.status::text,
      action.recurrence_pattern
    )
    from public.daily_actions as action
    where action.id = (
      select result_action_id
      from action_proposal_test_ids
      where label = 'executed_result'
    )
  ),
  concat_ws('|',
    'Call the recruiter and confirm next steps',
    (clock_timestamp() at time zone 'Australia/Melbourne')::date::text,
    ((clock_timestamp() at time zone 'Australia/Melbourne')::date + 2)::text,
    '14:30', '45', 'active', 'none'
  ),
  'Confirm uses the edited proposal and creates a canonical Today Action'
);

select is(
  (
    select daily_plan_id
    from public.daily_actions
    where id = (
      select result_action_id
      from action_proposal_test_ids
      where label = 'executed_result'
    )
  ),
  '72000000-0000-4000-8000-000000000001'::uuid,
  'the canonical Action RPC attaches the result to the active Today plan'
);

select is(
  (
    select result.result_daily_action_id
    from public.execute_clarity_action_create_proposal_v1(
      (select proposal_id from action_proposal_test_ids where label = 'execute')
    ) as result
  ),
  (
    select result_action_id
    from action_proposal_test_ids
    where label = 'executed_result'
  ),
  'duplicate confirmation returns the original canonical Action id'
);

select is(
  (
    select count(*)
    from public.daily_actions
    where title = 'Call the recruiter and confirm next steps'
      and user_id = '71000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'duplicate confirmation cannot create a duplicate Action'
);

insert into action_proposal_test_ids (label, proposal_id, response_id)
select 'dismiss', response.proposal_id, response.message_id
from public.append_clarity_response_v3(
  p_user_message_id => '74000000-0000-4000-8000-000000000002',
  p_content => 'I can add that if you want.',
  p_model_provider => 'test', p_model_version => 'test-model',
  p_next_move_type => 'recommend', p_structured_metadata => '{}'::jsonb,
  p_latency_ms => 1, p_proposal_type => 'action_create',
  p_proposal_summary => 'Book a haircut',
  p_proposal_rationale => 'The user named a concrete task.',
  p_action_title => 'Book a haircut',
  p_action_local_date => (clock_timestamp() at time zone 'Australia/Melbourne')::date,
  p_action_estimated_minutes => 15
) as response;

select is(
  public.dismiss_clarity_change_proposal_v1(
    (select proposal_id from action_proposal_test_ids where label = 'dismiss')
  )::text,
  'dismissed',
  'Not now dismisses an Action proposal'
);

select is(
  (
    select count(*)
    from public.daily_actions
    where title = 'Book a haircut'
      and user_id = '71000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'Not now creates no Action'
);

insert into action_proposal_test_ids (label, proposal_id, response_id)
select 'duplicate_one', response.proposal_id, response.message_id
from public.append_clarity_response_v3(
  p_user_message_id => '74000000-0000-4000-8000-000000000003',
  p_content => 'I can add that when you confirm.',
  p_model_provider => 'test', p_model_version => 'test-model',
  p_next_move_type => 'recommend', p_structured_metadata => '{}'::jsonb,
  p_latency_ms => 1, p_proposal_type => 'action_create',
  p_proposal_summary => 'Prepare interview notes',
  p_proposal_rationale => 'This is a concrete next step.',
  p_action_title => 'Prepare interview notes',
  p_action_local_date => (clock_timestamp() at time zone 'Australia/Melbourne')::date,
  p_action_estimated_minutes => 30
) as response;

insert into action_proposal_test_ids (label, proposal_id, response_id)
select 'duplicate_two', response.proposal_id, response.message_id
from public.append_clarity_response_v3(
  p_user_message_id => '74000000-0000-4000-8000-000000000004',
  p_content => 'The equivalent Action is already proposed.',
  p_model_provider => 'test', p_model_version => 'test-model',
  p_next_move_type => 'recommend', p_structured_metadata => '{}'::jsonb,
  p_latency_ms => 1, p_proposal_type => 'action_create',
  p_proposal_summary => 'Prepare interview notes',
  p_proposal_rationale => 'Equivalent evidence.',
  p_action_title => 'Prepare interview notes',
  p_action_local_date => (clock_timestamp() at time zone 'Australia/Melbourne')::date,
  p_action_estimated_minutes => 30
) as response;

select isnt(
  (select proposal_id from action_proposal_test_ids where label = 'duplicate_one'),
  null::uuid,
  'the first equivalent Action proposal is persisted'
);

select is(
  (select proposal_id from action_proposal_test_ids where label = 'duplicate_two'),
  null::uuid,
  'a simultaneous equivalent Action proposal is suppressed'
);

insert into action_proposal_test_ids (label, proposal_id, response_id)
select 'dismiss_reasserted', response.proposal_id, response.message_id
from public.append_clarity_response_v3(
  p_user_message_id => '74000000-0000-4000-8000-000000000005',
  p_content => 'You asked again, so I can offer it again.',
  p_model_provider => 'test', p_model_version => 'test-model',
  p_next_move_type => 'recommend', p_structured_metadata => '{}'::jsonb,
  p_latency_ms => 1, p_proposal_type => 'action_create',
  p_proposal_summary => 'Book a haircut',
  p_proposal_rationale => 'The user directly reasserted the dismissed Action.',
  p_action_title => 'Book a haircut',
  p_action_local_date => (clock_timestamp() at time zone 'Australia/Melbourne')::date,
  p_action_estimated_minutes => 15
) as response;

select isnt(
  (select proposal_id from action_proposal_test_ids where label = 'dismiss_reasserted'),
  null::uuid,
  'a direct later reassertion may create a fresh proposal after Not now'
);

select isnt(
  (select proposal_id from action_proposal_test_ids where label = 'dismiss_reasserted'),
  (select proposal_id from action_proposal_test_ids where label = 'dismiss'),
  'reassertion creates a new audit row rather than reviving the dismissed proposal'
);

select throws_ok(
  $$
    select * from public.append_clarity_response_v3(
      p_user_message_id => '74000000-0000-4000-8000-000000000006',
      p_content => 'Invalid past proposal.',
      p_model_provider => 'test', p_model_version => 'test-model',
      p_next_move_type => 'recommend', p_structured_metadata => '{}'::jsonb,
      p_latency_ms => 1, p_proposal_type => 'action_create',
      p_proposal_summary => 'Invalid past Action',
      p_proposal_rationale => 'This must fail safely.',
      p_action_title => 'Invalid past Action',
      p_action_local_date =>
        (clock_timestamp() at time zone 'Australia/Melbourne')::date - 1
    )
  $$,
  '22023',
  'A planned Action cannot be created in the past.',
  'the atomic append rejects a past Action before persisting either artifact'
);

select is(
  (
    select count(*)
    from public.clarity_messages
    where response_to_message_id = '74000000-0000-4000-8000-000000000006'
  ),
  0::bigint,
  'invalid Action validation leaves no assistant response behind'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.clarity_action_create_proposals',
    'INSERT, UPDATE, DELETE'
  ),
  'authenticated clients have no direct Action proposal write privileges'
);

select set_config(
  'request.jwt.claim.sub',
  '71000000-0000-4000-8000-000000000002',
  true
);

select is(
  (select count(*) from public.clarity_action_create_proposals),
  0::bigint,
  'RLS hides another user''s Action proposal details'
);

select throws_ok(
  format(
    'select * from public.execute_clarity_action_create_proposal_v1(%L)',
    (select proposal_id from action_proposal_test_ids where label = 'dismiss_reasserted')
  ),
  'P0002',
  'Action proposal not found.',
  'cross-user Action proposal execution is rejected'
);

select * from finish();
rollback;
