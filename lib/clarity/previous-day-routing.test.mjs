import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { parseAuthoritativeReturnState } from "./previous-day-routing.ts";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260825000002_return_boundary_v1.sql",
    import.meta.url,
  ),
  "utf8",
);

test("exactly one unresolved recent day parses as Quick Recap", () => {
  assert.deepEqual(
    parseAuthoritativeReturnState({
      state: "quick_recap",
      localDate: "2026-08-24",
      planStatus: "active",
      rangeStartDate: "2026-08-24",
      rangeEndDate: "2026-08-24",
      dayCount: 1,
    }),
    {
      kind: "quick_recap",
      localDate: "2026-08-24",
      planStatus: "active",
      rangeStartDate: "2026-08-24",
      rangeEndDate: "2026-08-24",
      dayCount: 1,
    },
  );
});

for (const dayCount of [2, 7]) {
  test(`${dayCount} unresolved dates parse as one Catch Up`, () => {
    assert.equal(
      parseAuthoritativeReturnState({
        state: "catch_up",
        rangeStartDate: "2026-08-18",
        rangeEndDate: "2026-08-24",
        dayCount,
      }).kind,
      "catch_up",
    );
  });
}

for (const dayCount of [8, 30]) {
  test(`${dayCount} unresolved dates parse as Get Current`, () => {
    assert.equal(
      parseAuthoritativeReturnState({
        state: "get_current",
        rangeStartDate: "2026-07-26",
        rangeEndDate: "2026-08-24",
        dayCount,
      }).kind,
      "get_current",
    );
  });
}

test("a boundary covering yesterday parses as Ready for Today", () => {
  assert.deepEqual(
    parseAuthoritativeReturnState({
      state: "ready_for_today",
      throughDate: "2026-08-24",
    }),
    {
      kind: "ready_for_today",
      throughDate: "2026-08-24",
    },
  );
});

test("the parser rejects a Catch Up beyond the seven-day boundary", () => {
  assert.throws(() =>
    parseAuthoritativeReturnState({
      state: "catch_up",
      rangeStartDate: "2026-08-17",
      rangeEndDate: "2026-08-24",
      dayCount: 8,
    }),
  );
});

test("SQL owns classification and both public entry points share it", () => {
  assert.match(
    migration,
    /create or replace function private\.resolve_return_backlog\(/,
  );
  assert.match(
    migration,
    /v_day_count = 1[\s\S]*v_unresolved_plan_date = v_yesterday[\s\S]*'state', 'quick_recap'/,
  );
  assert.match(
    migration,
    /when v_day_count between 1 and 7 then 'catch_up'[\s\S]*else 'get_current'/,
  );
  assert.match(
    migration,
    /create function public\.get_return_backlog_state\(\)[\s\S]*private\.resolve_return_backlog\(v_user_id, v_today\)/,
  );
  assert.match(
    migration,
    /create or replace function public\.start_current_day_v2\(\)[\s\S]*v_return_state := private\.resolve_return_backlog\(v_user_id, v_today\)/,
  );
});

test("profile-local today is resolved before classification", () => {
  assert.match(
    migration,
    /v_today := \(clock_timestamp\(\) at time zone v_timezone\)::date;/,
  );
  assert.match(
    migration,
    /v_today := \(v_now at time zone v_timezone\)::date;/,
  );
});
