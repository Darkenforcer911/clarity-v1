import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260816000002_notification_delivery_dispatch.sql",
    import.meta.url,
  ),
  "utf8",
);

test("materialization is bounded, recurrence-aware and conflict-safe", () => {
  assert.match(migration, /generate_series\(0, 30\)/i);
  assert.match(migration, /private\.calendar_commitment_occurs_on_date/i);
  assert.match(migration, /calendar_commitment_occurrences[\s\S]*not exists/i);
  assert.match(
    migration,
    /on conflict \(\s*push_subscription_id,\s*calendar_commitment_id,\s*occurrence_date,\s*reminder_offset_minutes\s*\) do update/i,
  );
  assert.match(migration, /join public\.push_subscriptions/i);
  assert.match(
    migration,
    /select\s+commitment\.user_id,\s+subscription\.id,\s+commitment\.id/i,
  );
});

test("claims use leases, skip locked, retry timing and sent protection", () => {
  assert.match(migration, /for update skip locked/i);
  assert.match(migration, /lease_expires_at <= p_now/i);
  assert.match(migration, /delivery\.next_attempt_at <= p_now/i);
  assert.match(migration, /delivery\.sent_at is null/i);
  assert.match(migration, /delivery\.attempt_count < 3/i);
});

test("revalidation covers edits, reminders, outcomes, subscriptions and expiry", () => {
  assert.match(migration, /v_commitment\.status = 'scheduled'/i);
  assert.match(migration, /v_subscription\.enabled/i);
  assert.match(
    migration,
    /= any\(v_commitment\.reminder_offsets_minutes\)/i,
  );
  assert.match(migration, /v_scheduled_for = v_delivery\.scheduled_for/i);
  assert.match(migration, /calendar_commitment_occurrences/i);
  assert.match(migration, /p_now < v_useful_until/i);
});

test("delivery results update subscription health and bound retries", () => {
  assert.match(migration, /status = 'sent'/i);
  assert.match(migration, /last_success_at = p_now/i);
  assert.match(migration, /failure_count = failure_count \+ 1/i);
  assert.match(migration, /when v_delivery\.attempt_count >= 3 then 'failed'/i);
  assert.match(migration, /p_retry_at >= v_useful_until/i);
});

test("dispatcher RPCs are service-role only and no scheduler is created", () => {
  assert.match(
    migration,
    /grant execute on function public\.materialize_notification_deliveries\(timestamptz\)\s+to service_role/i,
  );
  assert.doesNotMatch(migration, /cron\.schedule|pg_net|net\.http_post/i);
});
