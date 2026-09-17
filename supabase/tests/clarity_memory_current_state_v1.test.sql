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
    'a1000000-0000-4000-8000-000000000001',
    'memory-a@example.test',
    'authenticated',
    'authenticated',
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    'a1000000-0000-4000-8000-000000000002',
    'memory-b@example.test',
    'authenticated',
    'authenticated',
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

insert into public.onboarding_sessions (
  id,
  user_id,
  onboarding_version,
  status,
  current_step,
  user_draft,
  understanding,
  progress,
  synthesis,
  turn_count
)
values
  (
    'a2000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    2,
    'in_progress',
    'synthesis',
    jsonb_build_object(
      'basic_context',
      jsonb_build_object(
        'preferred_name', 'Alice',
        'date_of_birth', '1994-06-15',
        'city', 'Melbourne',
        'country', 'Australia',
        'timezone', 'Australia/Melbourne'
      )
    ),
    jsonb_build_object(
      'currentReality', jsonb_build_array(
        jsonb_build_object(
          'statement', 'Currently unemployed and applying for support roles',
          'truthState', 'fact',
          'confidence', 'high',
          'evidenceMessageIds', jsonb_build_array(
            'a3000000-0000-4000-8000-000000000001'
          )
        )
      ),
      'desiredFuture', jsonb_build_array(
        jsonb_build_object(
          'statement', 'Wants work with more ownership and room to grow',
          'truthState', 'inference',
          'confidence', 'medium',
          'evidenceMessageIds', jsonb_build_array(
            'a3000000-0000-4000-8000-000000000002'
          )
        )
      ),
      'capabilitiesAndAssets', jsonb_build_array(
        jsonb_build_object(
          'statement', 'Previously worked as L1 technical support',
          'truthState', 'fact',
          'confidence', 'high',
          'evidenceMessageIds', jsonb_build_array(
            'a3000000-0000-4000-8000-000000000001'
          )
        )
      ),
      'constraints', jsonb_build_array(
        jsonb_build_object(
          'statement', 'Available financial runway is not yet known',
          'truthState', 'unknown',
          'confidence', 'low',
          'evidenceMessageIds', jsonb_build_array()
        )
      ),
      'behavioralEvidence', jsonb_build_array(),
      'currentPriorityOrPressure', jsonb_build_array(),
      'possibleRoutes', jsonb_build_array()
    ),
    jsonb_build_object(
      'situation', 'clear',
      'whatMatters', 'clear',
      'future', 'getting_clearer',
      'constraints', 'getting_clearer',
      'readyForConfirmation', true
    ),
    jsonb_build_object(
      'whereYouAre', 'Between roles',
      'whatYouWant', 'A stronger support role',
      'whatYouHaveGoingForYou', 'Relevant experience',
      'whatCouldGetInTheWay', 'The route still needs testing',
      'stillUnsure', 'Financial runway',
      'whatMattersFirst', 'Test application traction',
      'horizons', jsonb_build_object(
        'longTerm', 'Work with growth',
        'midTerm', 'Move into L2 support',
        'shortTerm', 'Apply and interview',
        'bottleneck', 'Unknown conversion',
        'nextMove', 'Review current traction'
      )
    ),
    3
  ),
  (
    'a2000000-0000-4000-8000-000000000002',
    'a1000000-0000-4000-8000-000000000002',
    2,
    'in_progress',
    'conversation',
    '{}'::jsonb,
    '{}'::jsonb,
    '{"readyForConfirmation":false}'::jsonb,
    null,
    0
  );

insert into public.onboarding_messages (
  id,
  onboarding_session_id,
  user_id,
  role,
  content,
  created_at
)
values
  (
    'a3000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    'user',
    'I lost my L1 support job and I am applying again.',
    now() - interval '3 minutes'
  ),
  (
    'a3000000-0000-4000-8000-000000000002',
    'a2000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    'user',
    'I want more ownership and room to grow.',
    now() - interval '2 minutes'
  ),
  (
    'a3000000-0000-4000-8000-000000000003',
    'a2000000-0000-4000-8000-000000000002',
    'a1000000-0000-4000-8000-000000000002',
    'user',
    'This session is not ready.',
    now() - interval '1 minute'
  );

insert into public.onboarding_messages (
  id,
  onboarding_session_id,
  user_id,
  role,
  content,
  created_at,
  response_to_message_id,
  mode,
  structured_output,
  model_provider,
  model_version,
  latency_ms,
  input_tokens,
  output_tokens
)
values (
  'a3000000-0000-4000-8000-000000000004',
  'a2000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'clarity',
  'Here is the reviewed understanding.',
  now(),
  'a3000000-0000-4000-8000-000000000002',
  'SYNTHESIZE',
  jsonb_build_object(
    'unknowns', jsonb_build_array(
      jsonb_build_object(
        'statement', 'How urgent replacing income is',
        'materiality', 'high'
      )
    ),
    'insights', jsonb_build_array(
      jsonb_build_object(
        'statement', 'Work history supports a credible step into L2 support',
        'confidence', 'medium',
        'evidenceMessageIds', jsonb_build_array(
          'a3000000-0000-4000-8000-000000000001',
          'a3000000-0000-4000-8000-000000000002'
        )
      )
    ),
    'routes', jsonb_build_array(
      jsonb_build_object(
        'label', 'L2 support',
        'rationale', 'Build on relevant support experience',
        'confidence', 'medium',
        'evidenceMessageIds', jsonb_build_array(
          'a3000000-0000-4000-8000-000000000002'
        )
      )
    )
  ),
  'test-provider',
  'test-model',
  100,
  500,
  200
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'a1000000-0000-4000-8000-000000000002',
  true
);

select throws_ok(
  $$
    select public.confirm_onboarding_understanding_v1(
      'a2000000-0000-4000-8000-000000000002'
    )
  $$,
  '22023',
  'Review a synthesis before confirming.',
  'unconfirmed onboarding cannot seed memory'
);

select is(
  (select count(*) from public.clarity_memory_items),
  0::bigint,
  'the unconfirmed owner has no memory rows'
);

select set_config(
  'request.jwt.claim.sub',
  'a1000000-0000-4000-8000-000000000001',
  true
);

select lives_ok(
  $$
    select public.confirm_onboarding_understanding_v1(
      'a2000000-0000-4000-8000-000000000001'
    )
  $$,
  'ready onboarding confirms and seeds memory atomically'
);

select is(
  (select count(*) from public.clarity_memory_items),
  7::bigint,
  'four claims and three confirmed artifacts seed exactly once'
);

select is(
  (
    select count(*)
    from public.clarity_memory_items
    where truth_state = 'fact'
  ),
  2::bigint,
  'facts remain facts'
);

select is(
  (
    select count(*)
    from public.clarity_memory_items
    where truth_state = 'inference'
  ),
  3::bigint,
  'inferences remain inferences'
);

select is(
  (
    select count(*)
    from public.clarity_memory_items
    where truth_state = 'unknown'
  ),
  2::bigint,
  'claim and material unknowns remain unknown'
);

select is(
  (
    select materiality::text
    from public.clarity_memory_items
    where statement = 'How urgent replacing income is'
  ),
  'high',
  'unknown materiality survives exactly'
);

select is(
  (
    select memory_class::text
    from public.clarity_memory_items
    where statement = 'Previously worked as L1 technical support'
  ),
  'durable_memory',
  'past work history is Durable Memory even inside mixed onboarding data'
);

select is(
  (
    select memory_class::text
    from public.clarity_memory_items
    where statement = 'Currently unemployed and applying for support roles'
  ),
  'current_state',
  'current employment state remains Current State'
);

select ok(
  (
    select bool_and(observed_at is not null and review_after > observed_at)
    from public.clarity_memory_items
    where memory_class = 'current_state'
  ),
  'every Current State row has an observation and future review boundary'
);

select ok(
  (
    select bool_and(review_after is null)
    from public.clarity_memory_items
    where memory_class = 'durable_memory'
  ),
  'Durable Memory does not age out automatically'
);

select is(
  (
    select concat_ws('|', name, date_of_birth::text, city, country, timezone)
    from public.profiles
    where id = 'a1000000-0000-4000-8000-000000000001'
  ),
  'Alice|1994-06-15|Melbourne|Australia|Australia/Melbourne',
  'confirmed Stage A values are promoted to the canonical Profile'
);

select is(
  (
    select count(*)
    from public.clarity_memory_items
    where statement in ('Alice', 'Melbourne', 'Australia/Melbourne')
  ),
  0::bigint,
  'canonical Profile values are not duplicated as general memory'
);

select is(
  (
    select count(*)
    from public.clarity_memory_item_sources
    where source_type = 'onboarding_confirmation'
  ),
  7::bigint,
  'every seeded item retains confirmation provenance'
);

select is(
  (
    select count(*)
    from public.clarity_memory_item_sources
    where source_type = 'onboarding_message'
  ),
  6::bigint,
  'all available evidence-message provenance is retained'
);

select lives_ok(
  $$
    select public.confirm_onboarding_understanding_v1(
      'a2000000-0000-4000-8000-000000000001'
    )
  $$,
  'repeating confirmation safely reuses the frozen snapshot'
);

select is(
  (select count(*) from public.clarity_memory_items),
  7::bigint,
  'repeated confirmation does not duplicate memory'
);

select throws_ok(
  $$
    insert into public.clarity_memory_items (
      user_id,
      memory_class,
      truth_state,
      topic,
      statement,
      confidence,
      materiality,
      observed_at,
      confirmed_at
    ) values (
      'a1000000-0000-4000-8000-000000000001',
      'current_state',
      'fact',
      'bypass',
      'Direct write',
      'high',
      'high',
      now(),
      now()
    )
  $$,
  '42501',
  null,
  'authenticated clients cannot write memory tables directly'
);

select throws_ok(
  $$
    select public.supersede_clarity_memory_item_v1(
      p_memory_item_id := (
        select id
        from public.clarity_memory_items
        where statement = 'Currently unemployed and applying for support roles'
      ),
      p_statement := 'May have started a new role',
      p_truth_state := 'inference',
      p_confidence := 'low',
      p_materiality := 'high',
      p_source_type := 'onboarding_message',
      p_source_id := 'a3000000-0000-4000-8000-000000000002',
      p_observed_at := now(),
      p_review_after := now() + interval '30 days'
    )
  $$,
  '22023',
  'An inference cannot supersede a fact.',
  'an inference cannot silently replace a fact'
);

select set_config(
  'test.memory.old_id',
  (
    select id::text
    from public.clarity_memory_items
    where statement = 'Currently unemployed and applying for support roles'
  ),
  true
);

select set_config(
  'test.memory.new_id',
  public.supersede_clarity_memory_item_v1(
    p_memory_item_id := current_setting('test.memory.old_id')::uuid,
    p_statement := 'Started a support role this week',
    p_truth_state := 'fact',
    p_confidence := 'high',
    p_materiality := 'high',
    p_source_type := 'onboarding_message',
    p_source_id := 'a3000000-0000-4000-8000-000000000002',
    p_observed_at := now(),
    p_effective_on := current_date,
    p_review_after := now() + interval '30 days'
  )::text,
  true
);

select ok(
  (
    select old.status = 'superseded'
      and old.superseded_by_item_id = new.id
      and new.status = 'active'
    from public.clarity_memory_items as old
    join public.clarity_memory_items as new
      on new.id = current_setting('test.memory.new_id')::uuid
    where old.id = current_setting('test.memory.old_id')::uuid
  ),
  'supersession preserves the old item and points to the active replacement'
);

select lives_ok(
  $$
    select public.retract_clarity_memory_item_v1(
      (
        select id
        from public.clarity_memory_items
        where topic = 'possible_route'
          and status = 'active'
      ),
      'onboarding_message',
      'a3000000-0000-4000-8000-000000000002'
    )
  $$,
  'an owner can retract an active item through the deterministic RPC'
);

select is(
  (
    select status::text
    from public.clarity_memory_items
    where topic = 'possible_route'
  ),
  'retracted',
  'retraction retains the row as history'
);

select is(
  (
    select count(*)
    from public.life_areas
    where user_id = 'a1000000-0000-4000-8000-000000000001'
  ) + (
    select count(*)
    from public.daily_actions
    where user_id = 'a1000000-0000-4000-8000-000000000001'
  ) + (
    select count(*)
    from public.calendar_commitments
    where user_id = 'a1000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'memory seeding does not mutate Life, Actions, or Calendar'
);

select set_config(
  'request.jwt.claim.sub',
  'a1000000-0000-4000-8000-000000000002',
  true
);

select is(
  (select count(*) from public.clarity_memory_items),
  0::bigint,
  'another authenticated user cannot read the owner memory'
);

select is(
  (select count(*) from public.clarity_memory_item_sources),
  0::bigint,
  'another authenticated user cannot read provenance'
);

reset role;

select throws_ok(
  $$
    insert into public.clarity_memory_item_sources (
      memory_item_id,
      user_id,
      source_type,
      onboarding_message_id
    ) values (
      current_setting('test.memory.new_id')::uuid,
      'a1000000-0000-4000-8000-000000000001',
      'onboarding_message',
      'a3000000-0000-4000-8000-000000000003'
    )
  $$,
  '23503',
  null,
  'cross-user message provenance is rejected by owner-scoped foreign keys'
);

select throws_ok(
  $$
    update public.clarity_memory_items
    set
      status = 'superseded',
      superseded_at = now(),
      superseded_by_item_id = id
    where id = current_setting('test.memory.new_id')::uuid
  $$,
  '23514',
  null,
  'self-supersession is rejected'
);

select * from finish();
rollback;
