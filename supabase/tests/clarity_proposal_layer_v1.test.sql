begin;

select no_plan();

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
    '61000000-0000-4000-8000-000000000001',
    'proposal-a@example.test',
    'authenticated',
    'authenticated',
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '61000000-0000-4000-8000-000000000002',
    'proposal-b@example.test',
    'authenticated',
    'authenticated',
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

insert into public.clarity_conversations (id, user_id)
values
  (
    '62000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000001'
  ),
  (
    '62000000-0000-4000-8000-000000000002',
    '61000000-0000-4000-8000-000000000002'
  );

insert into public.clarity_messages (
  id,
  conversation_id,
  user_id,
  role,
  content,
  created_at
)
select
  ('63000000-0000-4000-8000-' || lpad(item.ordinality::text, 12, '0'))::uuid,
  '62000000-0000-4000-8000-000000000001'::uuid,
  '61000000-0000-4000-8000-000000000001'::uuid,
  'user',
  item.content,
  now() - make_interval(mins => 30 - item.ordinality::integer)
from unnest(array[
  'ordinary response',
  'invalid target',
  'foreign target',
  'inactive target',
  'execute proposal',
  'stale proposal',
  'supersede stale target',
  'competing proposal one',
  'competing proposal two',
  'edit proposal',
  'dismiss proposal',
  'duplicate proposal one',
  'duplicate proposal two',
  'execution failure proposal',
  'reassert dismissed proposal'
]) with ordinality as item(content, ordinality);

insert into public.clarity_messages (
  id,
  conversation_id,
  user_id,
  role,
  content,
  created_at
)
values (
  '63000000-0000-4000-8000-000000000101',
  '62000000-0000-4000-8000-000000000002',
  '61000000-0000-4000-8000-000000000002',
  'user',
  'foreign owner source',
  now() - interval '1 minute'
);

insert into public.clarity_memory_items (
  id,
  user_id,
  memory_class,
  truth_state,
  topic,
  statement,
  confidence,
  materiality,
  status,
  observed_at,
  review_after,
  confirmed_at,
  superseded_at
)
values
  (
    '64000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000001',
    'current_state', 'fact', 'employment', 'Currently unemployed',
    'high', 'high', 'active', now() - interval '60 days', now() + interval '2 days',
    now() - interval '60 days', null
  ),
  (
    '64000000-0000-4000-8000-000000000002',
    '61000000-0000-4000-8000-000000000001',
    'current_state', 'fact', 'employment', 'Applying for support roles',
    'high', 'high', 'active', now() - interval '45 days', now() + interval '5 days',
    now() - interval '45 days', null
  ),
  (
    '64000000-0000-4000-8000-000000000003',
    '61000000-0000-4000-8000-000000000001',
    'current_state', 'fact', 'work', 'Working casual retail shifts',
    'high', 'medium', 'active', now() - interval '30 days', now() + interval '10 days',
    now() - interval '30 days', null
  ),
  (
    '64000000-0000-4000-8000-000000000004',
    '61000000-0000-4000-8000-000000000001',
    'current_state', 'fact', 'housing', 'Living in a share house',
    'high', 'medium', 'active', now() - interval '20 days', now() + interval '15 days',
    now() - interval '20 days', null
  ),
  (
    '64000000-0000-4000-8000-000000000005',
    '61000000-0000-4000-8000-000000000001',
    'current_state', 'fact', 'project', 'Testing a cake business',
    'high', 'medium', 'active', now() - interval '10 days', now() + interval '20 days',
    now() - interval '10 days', null
  ),
  (
    '64000000-0000-4000-8000-000000000006',
    '61000000-0000-4000-8000-000000000001',
    'current_state', 'fact', 'study', 'Studying part time',
    'high', 'medium', 'active', now() - interval '5 days', now() + interval '25 days',
    now() - interval '5 days', null
  ),
  (
    '64000000-0000-4000-8000-000000000007',
    '61000000-0000-4000-8000-000000000001',
    'current_state', 'fact', 'health', 'Old inactive state',
    'high', 'low', 'retracted', now() - interval '90 days', now() - interval '60 days',
    now() - interval '90 days', now() - interval '60 days'
  ),
  (
    '64000000-0000-4000-8000-000000000101',
    '61000000-0000-4000-8000-000000000002',
    'current_state', 'fact', 'employment', 'Foreign owner state',
    'high', 'high', 'active', now() - interval '30 days', now() + interval '10 days',
    now() - interval '30 days', null
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-000000000001', true);

create temp table proposal_test_ids (
  label text primary key,
  proposal_id uuid,
  response_id uuid
);

insert into proposal_test_ids (label, proposal_id, response_id)
select 'ordinary', response.proposal_id, response.message_id
from public.append_clarity_response_v2(
  '63000000-0000-4000-8000-000000000001',
  'Ordinary reply.', 'test', 'test-model', 'ask', '{}'::jsonb, 1
) as response;

select is(
  (select proposal_id from proposal_test_ids where label = 'ordinary'),
  null::uuid,
  'a nullable proposal leaves an ordinary response unchanged'
);

select is(
  (select count(*) from public.clarity_change_proposals),
  0::bigint,
  'an ordinary response creates no proposal'
);

select throws_ok(
  $$
    select * from public.append_clarity_response_v2(
      '63000000-0000-4000-8000-000000000002',
      'Invalid target reply.', 'test', 'test-model', 'ask', '{}'::jsonb, 1,
      null, null, 'memory_update',
      '64000000-0000-4000-8000-000000009999',
      'Invented state', null, 'Update memory', 'The target is not real.'
    )
  $$,
  'P0002',
  'Memory proposal target is unavailable.',
  'a hallucinated target is rejected'
);

select is(
  (
    select count(*)
    from public.clarity_messages
    where response_to_message_id = '63000000-0000-4000-8000-000000000002'
  ),
  0::bigint,
  'invalid proposal validation cannot leave an assistant response behind'
);

select throws_ok(
  $$
    select * from public.append_clarity_response_v2(
      '63000000-0000-4000-8000-000000000003',
      'Foreign target reply.', 'test', 'test-model', 'ask', '{}'::jsonb, 1,
      null, null, 'memory_update',
      '64000000-0000-4000-8000-000000000101',
      'Changed foreign state', null, 'Update memory', 'Foreign targets are unavailable.'
    )
  $$,
  'P0002',
  'Memory proposal target is unavailable.',
  'a foreign-user target is rejected'
);

select throws_ok(
  $$
    select * from public.append_clarity_response_v2(
      '63000000-0000-4000-8000-000000000004',
      'Inactive target reply.', 'test', 'test-model', 'ask', '{}'::jsonb, 1,
      null, null, 'memory_update',
      '64000000-0000-4000-8000-000000000007',
      'Changed inactive state', null, 'Update memory', 'Inactive targets are unavailable.'
    )
  $$,
  'P0002',
  'Memory proposal target is unavailable.',
  'an inactive target is rejected'
);

insert into proposal_test_ids (label, proposal_id, response_id)
select 'execute', response.proposal_id, response.message_id
from public.append_clarity_response_v2(
  '63000000-0000-4000-8000-000000000005',
  'I can update that when you confirm.', 'test', 'test-model', 'ask', '{}'::jsonb, 1,
  null, null, 'memory_update',
  '64000000-0000-4000-8000-000000000001',
  'Started a new support job', current_date - 1,
  'Update what I know?', 'Your employment state changed.'
) as response;

select is(
  (
    select count(*)
    from public.clarity_memory_items
    where id = '64000000-0000-4000-8000-000000000001'
      and status = 'active'
  ),
  1::bigint,
  'a persisted provider candidate does not mutate Memory before confirmation'
);

select is(
  (
    select count(*)
    from public.clarity_memory_update_proposals as detail
    join public.clarity_change_proposals as proposal
      on proposal.id = detail.proposal_id
    where proposal.id = (select proposal_id from proposal_test_ids where label = 'execute')
      and proposal.source_assistant_message_id = (select response_id from proposal_test_ids where label = 'execute')
      and detail.target_memory_item_id = '64000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'assistant response and its typed proposal persist together'
);

select lives_ok(
  format(
    'select * from public.execute_clarity_memory_update_proposal_v1(%L)',
    (select proposal_id from proposal_test_ids where label = 'execute')
  ),
  'confirmation executes the typed Memory supersession'
);

select is(
  (
    select status::text
    from public.clarity_memory_items
    where id = '64000000-0000-4000-8000-000000000001'
  ),
  'superseded',
  'confirmation supersedes exactly the target Memory item'
);

select is(
  (
    select count(*)
    from public.clarity_memory_items
    where statement = 'Started a new support job' and status = 'active'
  ),
  1::bigint,
  'confirmation creates exactly one replacement Memory item'
);

select is(
  (
    select source.clarity_message_id
    from public.clarity_memory_item_sources as source
    join public.clarity_memory_update_proposals as detail
      on detail.result_memory_item_id = source.memory_item_id
    where detail.proposal_id = (select proposal_id from proposal_test_ids where label = 'execute')
  ),
  '63000000-0000-4000-8000-000000000005'::uuid,
  'replacement provenance references the originating user Clarity message'
);

select lives_ok(
  format(
    'select * from public.execute_clarity_memory_update_proposal_v1(%L)',
    (select proposal_id from proposal_test_ids where label = 'execute')
  ),
  'duplicate confirmation is idempotent'
);

select is(
  (
    select count(*)
    from public.clarity_memory_items
    where statement = 'Started a new support job'
  ),
  1::bigint,
  'duplicate confirmation cannot duplicate the replacement'
);

insert into proposal_test_ids (label, proposal_id, response_id)
select 'stale', response.proposal_id, response.message_id
from public.append_clarity_response_v2(
  '63000000-0000-4000-8000-000000000006',
  'I can update that when you confirm.', 'test', 'test-model', 'ask', '{}'::jsonb, 1,
  null, null, 'memory_update',
  '64000000-0000-4000-8000-000000000002',
  'Interviewing for support roles', null,
  'Update what I know?', 'The job search moved forward.'
) as response;

select lives_ok(
  $$
    select public.supersede_clarity_memory_item_v1(
      '64000000-0000-4000-8000-000000000002',
      'Paused the job search', 'fact', 'high', 'high',
      'clarity_message', '63000000-0000-4000-8000-000000000007',
      now(), current_date, now() + interval '30 days'
    )
  $$,
  'the target can change independently before proposal confirmation'
);

select is(
  (
    select status::text
    from public.execute_clarity_memory_update_proposal_v1(
      (select proposal_id from proposal_test_ids where label = 'stale')
    )
  ),
  'expired',
  'a stale proposal expires instead of rebasing'
);

select is(
  (
    select count(*)
    from public.clarity_memory_items
    where statement = 'Interviewing for support roles'
  ),
  0::bigint,
  'stale confirmation performs no Memory mutation'
);

insert into proposal_test_ids (label, proposal_id, response_id)
select 'compete_one', response.proposal_id, response.message_id
from public.append_clarity_response_v2(
  '63000000-0000-4000-8000-000000000008',
  'First possible update.', 'test', 'test-model', 'ask', '{}'::jsonb, 1,
  null, null, 'memory_update',
  '64000000-0000-4000-8000-000000000003',
  'Working full-time retail', null,
  'Update work state?', 'This is one interpretation.'
) as response;

insert into proposal_test_ids (label, proposal_id, response_id)
select 'compete_two', response.proposal_id, response.message_id
from public.append_clarity_response_v2(
  '63000000-0000-4000-8000-000000000009',
  'Second possible update.', 'test', 'test-model', 'ask', '{}'::jsonb, 1,
  null, null, 'memory_update',
  '64000000-0000-4000-8000-000000000003',
  'Left the retail role', null,
  'Update work state?', 'This is a competing interpretation.'
) as response;

select is(
  (
    select status::text
    from public.execute_clarity_memory_update_proposal_v1(
      (select proposal_id from proposal_test_ids where label = 'compete_one')
    )
  ),
  'executed',
  'one competing proposal can execute'
);

select is(
  (
    select status::text
    from public.execute_clarity_memory_update_proposal_v1(
      (select proposal_id from proposal_test_ids where label = 'compete_two')
    )
  ),
  'expired',
  'the competing proposal expires after its target changes'
);

insert into proposal_test_ids (label, proposal_id, response_id)
select 'edit', response.proposal_id, response.message_id
from public.append_clarity_response_v2(
  '63000000-0000-4000-8000-000000000010',
  'You can edit this before confirming.', 'test', 'test-model', 'ask', '{}'::jsonb, 1,
  null, null, 'memory_update',
  '64000000-0000-4000-8000-000000000004',
  'Moved into a new apartment on September 15, 2026.', '2026-09-15',
  'Update housing?', 'Your housing state changed.'
) as response;

select is(
  (
    select replacement_statement
    from public.clarity_memory_update_proposals
    where proposal_id = (select proposal_id from proposal_test_ids where label = 'edit')
  ),
  'Moved into a new apartment',
  'proposal persistence keeps the effective date out of free-text state'
);

select is(
  (
    select revision
    from public.edit_clarity_memory_update_proposal_v1(
      (select proposal_id from proposal_test_ids where label = 'edit'),
      1,
      'Moved into a new apartment',
      '2026-09-16'
    )
  ),
  2,
  'Edit updates only typed fields and increments the revision'
);

select is(
  (
    select replacement_statement
    from public.clarity_memory_update_proposals
    where proposal_id = (select proposal_id from proposal_test_ids where label = 'edit')
  ),
  'Moved into a new apartment',
  'the typed replacement statement is updated'
);

select is(
  (
    select detail.effective_on::text
    from public.clarity_memory_update_proposals as detail
    where detail.proposal_id = (select proposal_id from proposal_test_ids where label = 'edit')
  ),
  '2026-09-16',
  'Save persists the edited canonical effective date for reload'
);

select is(
  (
    select status::text
    from public.clarity_memory_items
    where id = '64000000-0000-4000-8000-000000000004'
  ),
  'active',
  'editing a proposal does not mutate Memory'
);

select throws_ok(
  format(
    'select * from public.edit_clarity_memory_update_proposal_v1(%L, 1, %L, null)',
    (select proposal_id from proposal_test_ids where label = 'edit'),
    'A stale revision must fail'
  ),
  '40001',
  'This proposal changed. Reload it before editing.',
  'Edit rejects a stale revision'
);

select is(
  (
    select status::text
    from public.execute_clarity_memory_update_proposal_v1(
      (select proposal_id from proposal_test_ids where label = 'edit')
    )
  ),
  'executed',
  'Confirm executes the edited proposal revision'
);

select is(
  (
    select item.effective_on::text
    from public.clarity_memory_items as item
    join public.clarity_memory_update_proposals as detail
      on detail.result_memory_item_id = item.id
    where detail.proposal_id = (select proposal_id from proposal_test_ids where label = 'edit')
  ),
  '2026-09-16',
  'the replacement Memory item uses the edited effective date'
);

select is(
  (
    select count(*)
    from public.clarity_memory_items
    where statement = 'Moved into a new apartment'
      and effective_on = '2026-09-16'
  ),
  1::bigint,
  'Confirm creates exactly one date-correct replacement Memory item'
);

select is(
  (
    select count(*)
    from public.clarity_memory_items
    where id = '64000000-0000-4000-8000-000000000004'
      and status = 'superseded'
  ),
  1::bigint,
  'Confirm supersedes the edited proposal target exactly once'
);

select lives_ok(
  format(
    'select * from public.execute_clarity_memory_update_proposal_v1(%L)',
    (select proposal_id from proposal_test_ids where label = 'edit')
  ),
  'reconfirming the edited proposal is idempotent'
);

select is(
  (
    select count(*)
    from public.clarity_memory_items
    where statement = 'Moved into a new apartment'
      and effective_on = '2026-09-16'
  ),
  1::bigint,
  'reconfirming cannot duplicate the edited replacement'
);

insert into proposal_test_ids (label, proposal_id, response_id)
select 'dismiss', response.proposal_id, response.message_id
from public.append_clarity_response_v2(
  '63000000-0000-4000-8000-000000000011',
  'You can decline this update.', 'test', 'test-model', 'ask', '{}'::jsonb, 1,
  null, null, 'memory_update',
  '64000000-0000-4000-8000-000000000005',
  'Running a cake business full time', null,
  'Update project state?', 'The project may have become primary work.'
) as response;

select is(
  public.dismiss_clarity_change_proposal_v1(
    (select proposal_id from proposal_test_ids where label = 'dismiss')
  )::text,
  'dismissed',
  'Not now dismisses the proposal'
);

select is(
  (
    select status::text
    from public.clarity_memory_items
    where id = '64000000-0000-4000-8000-000000000005'
  ),
  'active',
  'Not now changes no Memory'
);

insert into proposal_test_ids (label, proposal_id, response_id)
select 'dismiss_reasserted', response.proposal_id, response.message_id
from public.append_clarity_response_v2(
  '63000000-0000-4000-8000-000000000015',
  'You reasserted the correction, so I can offer it again.',
  'test', 'test-model', 'clarify', '{}'::jsonb, 1,
  null, null, 'memory_update',
  '64000000-0000-4000-8000-000000000005',
  'Running a cake business full time', null,
  'Update project state?', 'The user directly reasserted the dismissed correction.'
) as response;

select isnt(
  (select proposal_id from proposal_test_ids where label = 'dismiss_reasserted'),
  null::uuid,
  'a direct later reassertion may create a fresh proposal after Not now'
);

select isnt(
  (select proposal_id from proposal_test_ids where label = 'dismiss_reasserted'),
  (select proposal_id from proposal_test_ids where label = 'dismiss'),
  'the reassertion creates a new auditable proposal rather than reviving the dismissed row'
);

select is(
  (
    select status::text
    from public.clarity_memory_items
    where id = '64000000-0000-4000-8000-000000000005'
  ),
  'active',
  'the fresh reassertion proposal still does not mutate Memory before Confirm'
);

insert into proposal_test_ids (label, proposal_id, response_id)
select 'duplicate_one', response.proposal_id, response.message_id
from public.append_clarity_response_v2(
  '63000000-0000-4000-8000-000000000012',
  'First equivalent proposal.', 'test', 'test-model', 'ask', '{}'::jsonb, 1,
  null, null, 'memory_update',
  '64000000-0000-4000-8000-000000000006',
  'Studying full time', null,
  'Update study state?', 'Study hours increased.'
) as response;

insert into proposal_test_ids (label, proposal_id, response_id)
select 'duplicate_two', response.proposal_id, response.message_id
from public.append_clarity_response_v2(
  '63000000-0000-4000-8000-000000000013',
  'Second equivalent proposal.', 'test', 'test-model', 'ask', '{}'::jsonb, 1,
  null, null, 'memory_update',
  '64000000-0000-4000-8000-000000000006',
  'Studying full time', null,
  'Update study state?', 'Equivalent new evidence.'
) as response;

select isnt(
  (select proposal_id from proposal_test_ids where label = 'duplicate_one'),
  null::uuid,
  'the first equivalent proposal is persisted'
);

select is(
  (select proposal_id from proposal_test_ids where label = 'duplicate_two'),
  null::uuid,
  'an equivalent simultaneous proposal card is deduplicated'
);

select is(
  (
    select count(*)
    from public.clarity_messages
    where response_to_message_id = '63000000-0000-4000-8000-000000000013'
  ),
  1::bigint,
  'proposal deduplication does not discard the ordinary assistant response'
);

insert into proposal_test_ids (label, proposal_id, response_id)
select 'failure', response.proposal_id, response.message_id
from public.append_clarity_response_v2(
  '63000000-0000-4000-8000-000000000014',
  'This update will exercise rollback safety.', 'test', 'test-model', 'ask', '{}'::jsonb, 1,
  null, null, 'memory_update',
  '64000000-0000-4000-8000-000000000006',
  'Completed the course', null,
  'Update study state?', 'The course may be complete.'
) as response;

reset role;

create function pg_temp.reject_proposal_memory_insert()
returns trigger
language plpgsql
as $$
begin
  if new.statement = 'Completed the course' then
    raise exception 'forced proposal execution failure';
  end if;
  return new;
end;
$$;

create trigger proposal_test_reject_memory_insert
before insert on public.clarity_memory_items
for each row execute function pg_temp.reject_proposal_memory_insert();

set local role authenticated;
select set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-000000000001', true);

select is(
  (
    select status::text
    from public.execute_clarity_memory_update_proposal_v1(
      (select proposal_id from proposal_test_ids where label = 'failure')
    )
  ),
  'execution_failed',
  'an execution failure is recorded safely'
);

select is(
  (
    select count(*)
    from public.clarity_memory_items
    where statement = 'Completed the course'
  ),
  0::bigint,
  'execution failure leaves no partial replacement Memory item'
);

select is(
  (
    select status::text
    from public.clarity_memory_items
    where id = '64000000-0000-4000-8000-000000000006'
  ),
  'active',
  'execution failure leaves the original target active'
);

reset role;
drop trigger proposal_test_reject_memory_insert on public.clarity_memory_items;
drop function pg_temp.reject_proposal_memory_insert();
set local role authenticated;
select set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-000000000001', true);

select is(
  (
    select status::text
    from public.execute_clarity_memory_update_proposal_v1(
      (select proposal_id from proposal_test_ids where label = 'failure')
    )
  ),
  'executed',
  'a safe retry can execute after the transient failure is gone'
);

select set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-000000000002', true);

select is(
  (select count(*) from public.clarity_change_proposals),
  0::bigint,
  'RLS hides another user''s proposal envelopes'
);

select is(
  (select count(*) from public.clarity_memory_update_proposals),
  0::bigint,
  'RLS hides another user''s typed proposal details'
);

select throws_ok(
  format(
    'select * from public.execute_clarity_memory_update_proposal_v1(%L)',
    (select proposal_id from proposal_test_ids where label = 'edit')
  ),
  'P0002',
  'Memory update proposal not found.',
  'cross-user proposal execution is rejected'
);

select * from finish();
rollback;
