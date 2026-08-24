import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260816000001_notifications_foundation.sql",
    import.meta.url,
  ),
  "utf8",
);

test("notification tables are private, forced-RLS foundations", () => {
  assert.match(migration, /alter table public\.push_subscriptions force row level security/i);
  assert.match(migration, /alter table public\.notification_deliveries force row level security/i);
  assert.match(
    migration,
    /revoke all on table public\.push_subscriptions from public, anon, authenticated/i,
  );
  assert.match(
    migration,
    /revoke all on table public\.notification_deliveries from public, anon, authenticated/i,
  );
});

test("delivery records have the V1 idempotency boundary and retry groundwork", () => {
  assert.match(
    migration,
    /unique\s*\(\s*push_subscription_id,\s*calendar_commitment_id,\s*occurrence_date,\s*reminder_offset_minutes\s*\)/i,
  );
  assert.match(migration, /lease_expires_at timestamptz/i);
  assert.match(migration, /next_attempt_at timestamptz/i);
  assert.match(migration, /attempt_count integer not null default 0/i);
  assert.match(
    migration,
    /foreign key \(\s*push_subscription_id,\s*user_id\s*\)[\s\S]*references public\.push_subscriptions\(id, user_id\)/i,
  );
  assert.match(
    migration,
    /foreign key \(\s*calendar_commitment_id,\s*user_id\s*\)[\s\S]*references public\.calendar_commitments\(id, user_id\)/i,
  );
});

test("subscription registration and deactivation are authenticated and owned", () => {
  assert.match(migration, /v_user_id uuid := auth\.uid\(\)/i);
  assert.match(
    migration,
    /on conflict \(endpoint\) do update[\s\S]*where push_subscriptions\.user_id = excluded\.user_id/i,
  );
  assert.match(
    migration,
    /update public\.push_subscriptions[\s\S]*where user_id = v_user_id\s+and endpoint = p_endpoint/i,
  );
});

test("Calendar defaults and date-only semantics are enforced in the database", () => {
  assert.match(migration, /when p_commitment_type = 'event' then array\[120\]/i);
  assert.match(migration, /else array\[1440\]/i);
  assert.match(migration, /reminder_offset % 1440 <> 0/i);
  assert.match(migration, /cardinality\(p_offsets\) <= 10/i);
  assert.match(migration, /reminder_offset > 43200/i);
});

test("edits and event reschedules retain compatible reminder settings", () => {
  assert.match(
    migration,
    /coalesce\(p_reminder_offsets_minutes, v_existing\.reminder_offsets_minutes\)/i,
  );
  assert.match(
    migration,
    /v_commitment\.timezone,\s+v_commitment\.reminder_offsets_minutes,\s+v_commitment\.id/i,
  );
});
