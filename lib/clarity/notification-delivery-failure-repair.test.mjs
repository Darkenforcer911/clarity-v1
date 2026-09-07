import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260908000002_fix_notification_delivery_failure.sql",
    import.meta.url,
  ),
  "utf8",
);

test("notification failure repair preserves Action and Calendar retry scheduling", () => {
  assert.match(
    migration,
    /create or replace function public\.record_notification_delivery_failure/,
  );
  assert.match(migration, /private\.notification_delivery_schedule/);
  assert.match(migration, /private\.action_notification_delivery_schedule/);
  assert.match(migration, /calendar_commitment_id is not null/);
  assert.match(migration, /daily_action_id/);
});

test("notification failure repair restores canonical subscription accounting", () => {
  assert.match(
    migration,
    /enabled = case when p_disable_subscription then false else enabled end/,
  );
  assert.match(migration, /failure_count = failure_count \+ 1/);
  assert.match(migration, /last_failure_at = p_now/);
  assert.doesNotMatch(migration, /\bdisabled_at\s*=/);
});

test("notification failure repair remains service-role-only", () => {
  assert.match(migration, /security definer[\s\S]*set search_path = ''/i);
  assert.match(
    migration,
    /revoke all on function public\.record_notification_delivery_failure\([\s\S]*from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.record_notification_delivery_failure\([\s\S]*to service_role/,
  );
});
