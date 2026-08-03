begin;

select plan(8);

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
values (
  '10000000-0000-0000-0000-000000000001',
  'restore-actions@example.test',
  'authenticated',
  'authenticated',
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);

insert into public.daily_plans (
  id,
  user_id,
  local_date,
  status,
  focus,
  proposed_at
)
values
  (
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '2026-08-03',
    'proposed',
    'Test restore ordering',
    now()
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    '2026-08-04',
    'proposed',
    'Test multiple restores',
    now()
  );

insert into public.daily_actions (
  id,
  user_id,
  daily_plan_id,
  title,
  action_type,
  status,
  estimated_minutes,
  scheduled_time,
  why_it_exists,
  definition_of_done,
  suggested_method,
  sort_order,
  created_at,
  recurrence_pattern,
  recurrence_days
)
values
  (
    '30000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'Kept action',
    'flexible',
    'proposed',
    20,
    null,
    'Kept detail',
    'Kept done condition',
    'Kept method',
    0,
    '2026-08-03 00:00:00+00',
    'none',
    '{}'
  ),
  (
    '30000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'Removed action',
    'fixed',
    'removed',
    45,
    '2026-08-03 10:30:00+00',
    'Context: Preserve this detail',
    'Preserve this done condition',
    'Preserve this method',
    1,
    '2026-08-03 00:01:00+00',
    'weekly',
    '{}'
  ),
  (
    '30000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'Added after removal',
    'flexible',
    'proposed',
    30,
    null,
    'Added detail',
    'Added done condition',
    'Added method',
    1,
    '2026-08-03 00:02:00+00',
    'none',
    '{}'
  ),
  (
    '30000000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000002',
    'Second plan kept',
    'flexible',
    'proposed',
    15,
    null,
    'Kept detail',
    'Kept done condition',
    'Kept method',
    4,
    '2026-08-04 00:00:00+00',
    'none',
    '{}'
  ),
  (
    '30000000-0000-0000-0000-000000000005',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000002',
    'Removed first',
    'flexible',
    'removed',
    15,
    null,
    'First detail',
    'First done condition',
    'First method',
    1,
    '2026-08-04 00:03:00+00',
    'none',
    '{}'
  ),
  (
    '30000000-0000-0000-0000-000000000006',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000002',
    'Removed second',
    'flexible',
    'removed',
    15,
    null,
    'Second detail',
    'Second done condition',
    'Second method',
    3,
    '2026-08-04 00:01:00+00',
    'none',
    '{}'
  ),
  (
    '30000000-0000-0000-0000-000000000007',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000002',
    'Removed third',
    'flexible',
    'removed',
    15,
    null,
    'Third detail',
    'Third done condition',
    'Third method',
    2,
    '2026-08-04 00:02:00+00',
    'none',
    '{}'
  );

select is(
  public.restore_removed_proposed_actions(
    '20000000-0000-0000-0000-000000000001'
  ),
  1,
  'restores one removed action whose former order was reused'
);

select is(
  (
    select array_agg(title order by sort_order)
    from public.daily_actions
    where daily_plan_id = '20000000-0000-0000-0000-000000000001'
      and status <> 'removed'
  ),
  array['Kept action', 'Added after removal', 'Removed action'],
  'preserves kept order and appends the restored action'
);

select is(
  (
    select row(
      title,
      scheduled_time,
      estimated_minutes,
      why_it_exists,
      recurrence_pattern
    )::text
    from public.daily_actions
    where id = '30000000-0000-0000-0000-000000000002'
  ),
  row(
    'Removed action',
    '2026-08-03 10:30:00+00'::timestamptz,
    45,
    'Context: Preserve this detail',
    'weekly'
  )::text,
  'restoration preserves the latest edited action fields'
);

select is(
  public.restore_removed_proposed_actions(
    '20000000-0000-0000-0000-000000000002'
  ),
  3,
  'restores several removed actions atomically'
);

select is(
  (
    select array_agg(title order by sort_order)
    from public.daily_actions
    where daily_plan_id = '20000000-0000-0000-0000-000000000002'
      and status <> 'removed'
  ),
  array[
    'Second plan kept',
    'Removed first',
    'Removed third',
    'Removed second'
  ],
  'uses retained sort order rather than removal sequence'
);

select is(
  (
    select count(*)
    from (
      select daily_plan_id, sort_order
      from public.daily_actions
      where status <> 'removed'
      group by daily_plan_id, sort_order
      having count(*) > 1
    ) as duplicate_orders
  ),
  0::bigint,
  'leaves no duplicate plan and sort-order pairs'
);

select is(
  (
    select array_agg(sort_order order by sort_order)
    from public.daily_actions
    where daily_plan_id = '20000000-0000-0000-0000-000000000002'
      and status <> 'removed'
  ),
  array[0, 1, 2, 3],
  'compacts final action ordering where practical'
);

select is(
  public.restore_removed_proposed_actions(
    '20000000-0000-0000-0000-000000000002'
  ),
  0,
  'repeated restoration is safe when nothing remains removed'
);

select * from finish();

rollback;
