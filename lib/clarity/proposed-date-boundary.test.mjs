import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  getProposedDateBoundary,
  getProposedDateBoundaryPresentation,
} from "./proposed-date-boundary.ts";

test("a current-day proposed plan remains actionable", () => {
  assert.equal(
    getProposedDateBoundary("2026-08-15", "2026-08-15"),
    null,
  );
});

test("an unapproved proposed plan crossing midnight enters the boundary state", () => {
  assert.deepEqual(
    getProposedDateBoundary("2026-08-15", "2026-08-16"),
    {
      endedLocalDate: "2026-08-15",
      currentLocalDate: "2026-08-16",
    },
  );
});

test("the stale completion state replaces confirmation with Return to Today", () => {
  const boundary = getProposedDateBoundary(
    "2026-08-15",
    "2026-08-16",
  );
  assert.ok(boundary);

  assert.deepEqual(getProposedDateBoundaryPresentation(boundary), {
    heading: "Saturday has ended.",
    message:
      "It's now Sunday. Return to Today to finish Saturday and continue.",
    actionLabel: "Return to Today",
    actionHref: "/today",
  });
});

test("a future plan date is not described as ended", () => {
  assert.equal(
    getProposedDateBoundary("2026-08-16", "2026-08-15"),
    null,
  );
});

test("the canonical completion RPC rejects a stale profile-local plan date", () => {
  const sql = readFileSync(
    new URL(
      "../../supabase/migrations/20260807000001_proposed_plan_reconciliation.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(
    sql,
    /v_plan\.local_date <> \(v_recorded_at at time zone v_timezone\)::date/,
  );
  assert.match(
    sql,
    /Today has changed\. Return to Today before completing this action/,
  );
});
