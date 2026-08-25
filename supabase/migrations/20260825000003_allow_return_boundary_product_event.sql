alter table public.product_events
drop constraint product_events_known_name;

alter table public.product_events
add constraint product_events_known_name check (
  event_name in (
    'app_opened',
    'day_shaping_started',
    'plan_generated',
    'plan_approved',
    'action_completed',
    'day_closing_started',
    'day_closed',
    'day_close_undone',
    'action_removed_from_today',
    'action_replaced',
    'action_restored_to_today',
    'return_boundary_recorded'
  )
);
