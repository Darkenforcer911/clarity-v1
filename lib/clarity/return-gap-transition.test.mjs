import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  isHistoricalReturnGapDate,
  isReturnGapBlockingAction,
} from "./return-gap-boundary.ts";

test("only approved or active actions block lightweight Catch-Up", () => {
  assert.equal(
    isReturnGapBlockingAction({ status: "proposed", approvedAt: null }),
    false,
  );
  assert.equal(
    isReturnGapBlockingAction({ status: "removed", approvedAt: null }),
    false,
  );
  assert.equal(
    isReturnGapBlockingAction({ status: "completed", approvedAt: null }),
    false,
  );
  assert.equal(
    isReturnGapBlockingAction({ status: "rescheduled", approvedAt: null }),
    false,
  );
  assert.equal(
    isReturnGapBlockingAction({ status: "active", approvedAt: null }),
    true,
  );
  assert.equal(
    isReturnGapBlockingAction({
      status: "completed",
      approvedAt: "2026-08-10T08:00:00.000Z",
    }),
    true,
  );
});

test("Catch-Up ranges never include or mutate the current local date", () => {
  assert.equal(isHistoricalReturnGapDate("2026-08-14", "2026-08-15"), true);
  assert.equal(isHistoricalReturnGapDate("2026-08-15", "2026-08-15"), false);
  assert.equal(isHistoricalReturnGapDate("2026-08-16", "2026-08-15"), false);
});

test("the forward migration preserves retry and data-integrity guards", () => {
  const sql = readFileSync(
    new URL(
      "../../supabase/migrations/20260815000001_fix_return_gap_action_state.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(sql, /v_expected_end := v_today - 1;/);
  assert.match(sql, /if v_record_id is not null then[\s\S]*return v_record_id;/);
  assert.match(sql, /plan\.approved_at is not null[\s\S]*plan\.status not in \('unshaped', 'proposed'\)/);
  assert.match(sql, /action\.approved_at is not null[\s\S]*action\.status = 'active'/);
  assert.match(sql, /action\.approved_at is null[\s\S]*action\.status = 'proposed'/);
  assert.match(sql, /plan\.local_date between p_gap_start_date and p_gap_end_date/);
  assert.match(sql, /where profile\.id = v_user_id[\s\S]*for update;/);
  assert.doesNotMatch(sql, /insert into public\.daily_actions/);
  assert.doesNotMatch(
    sql,
    /action\.status in \('completed', 'rescheduled', 'dropped'\)/,
  );
});
