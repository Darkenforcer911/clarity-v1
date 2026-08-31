import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const activeToday = readFileSync(
  new URL("../../components/clarity/active-today.tsx", import.meta.url),
  "utf8",
);
const architecture = readFileSync(
  new URL("../../docs/clarity-intelligence-v1.md", import.meta.url),
  "utf8",
);

test("Active Today renders only approaching commitments before Next Action", () => {
  const comingUpAt = activeToday.indexOf('heading="Coming up"');
  const nextActionAt = activeToday.indexOf("{nextAction ? (");
  const laterAt = activeToday.indexOf("Later today");

  assert.ok(comingUpAt >= 0);
  assert.ok(nextActionAt > comingUpAt);
  assert.ok(laterAt > nextActionAt);
  assert.match(
    activeToday,
    /nextActionDurationMinutes: nextAction\?\.estimated_minutes \?\? null/,
  );
});

test("Later today merges timed Actions and commitments while Remaining stays untimed", () => {
  assert.match(activeToday, /orderLaterTodayItems\(\{/);
  assert.match(activeToday, /actions: laterTimedActions/);
  assert.match(activeToday, /commitments: unresolvedLaterCommitments/);
  assert.match(activeToday, /remainingUntimedActions\.map/);
  assert.doesNotMatch(activeToday, /laterActions\.map/);
});

test("imminent timed Actions keep the Coming up promotion", () => {
  assert.match(
    activeToday,
    /nextActionTiming\?\.kind === "future"[\s\S]*\? "Coming up"/,
  );
  assert.match(
    activeToday,
    /nextActionTiming\?\.kind === "overdue" \|\| nextActionTiming\?\.kind === "now"[\s\S]*\? "Happening now"/,
  );
});

test("future Clarity focus proposals cannot silently rewrite an accepted day", () => {
  for (const input of [
    "Current Direction",
    "immediate bottleneck",
    "Calendar constraints",
    "available capacity",
    "Action duration",
    "recent evidence",
    "current profile-local time",
    "accepted Shape Today plan",
  ]) {
    assert.match(architecture, new RegExp(input));
  }
  assert.match(architecture, /does not silently rewrite/);
  assert.match(architecture, /confirmed before[\s\S]*application logic applies it/);
});
