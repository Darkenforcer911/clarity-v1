import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260825000001_at_start_time_reminders.sql",
    import.meta.url,
  ),
  "utf8",
);

test("timed commitment validation admits zero without admitting negatives", () => {
  assert.match(migration, /reminder_offset < 0/i);
  assert.match(
    migration,
    /p_day_level_only[\s\S]*reminder_offset = 0[\s\S]*reminder_offset % 1440 <> 0/i,
  );
  assert.match(migration, /reminder_offset_minutes between 0 and 43200/i);
});

test("date-only deadlines reject zero and keep the day-level convention", () => {
  assert.match(
    migration,
    /p_commitment_type = 'deadline' and p_deadline_due_time is null[\s\S]*p_reminder_offset_minutes = 0/i,
  );
  assert.match(migration, /time '09:00'/i);
});

test("At-start delivery has a bounded non-zero useful window", () => {
  assert.match(
    migration,
    /when p_reminder_offset_minutes = 0[\s\S]*scheduled_for \+ interval '10 minutes'/i,
  );
  assert.match(
    migration,
    /else least\(scheduled_for \+ interval '2 hours', v_actual_at\)/i,
  );
});

test("the server-side Event default becomes zero without rewriting data", () => {
  assert.match(
    migration,
    /case when p_commitment_type = 'event' then array\[0\] else array\[1440\] end/i,
  );
  assert.doesNotMatch(migration, /update public\.calendar_commitments/i);
});

test("delivery idempotency is not replaced or weakened", () => {
  assert.doesNotMatch(migration, /drop constraint notification_deliveries_idempotency_unique/i);
  assert.doesNotMatch(migration, /drop index/i);
});
