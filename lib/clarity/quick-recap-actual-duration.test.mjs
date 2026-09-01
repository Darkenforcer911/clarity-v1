import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { formatDuration } from "./duration.ts";

const read = (relativePath) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

const panel = read("../../components/clarity/recap-action-panel.tsx");
const experience = read("../../components/clarity/recap-experience.tsx");
const completedItem = read(
  "../../components/clarity/recap-completed-item-form.tsx",
);
const catchUp = read("../../components/clarity/previous-day-catch-up.tsx");
const transition = read("../../app/(app)/today/day-transition-actions.ts");
const schemas = read("./schemas.ts");
const service = read("./daily-loop-service.ts");
const calendarHistory = read(
  "../../components/clarity/calendar-history.tsx",
);
const recapRpc = read(
  "../../supabase/migrations/20260729000001_direct_catch_up_resolutions.sql",
);

test("Done and Some progress expose optional actual duration beside the planned estimate", () => {
  assert.match(
    panel,
    /activeOutcome === "made_progress"[\s\S]*<TimeSpentField[\s\S]*plannedMinutes=\{plannedMinutes\}/,
  );
  assert.match(
    panel,
    /activeOutcome === "finished"[\s\S]*<TimeSelector[\s\S]*<TimeSpentField[\s\S]*plannedMinutes=\{plannedMinutes\}/,
  );
  assert.match(catchUp, /plannedMinutes: action\.estimated_minutes/);
  assert.doesNotMatch(
    panel.slice(panel.indexOf('activeOutcome === "not_done"')),
    /activeOutcome === "not_done"[\s\S]{0,500}<TimeSpentField/,
  );
});

test("planned estimates and actual duration remain separate canonical facts", () => {
  assert.match(catchUp, /name=\{`actualMinutes:\$\{action\.id\}`\}/);
  assert.match(transition, /approximateMinutes: actualMinutes/);
  assert.match(schemas, /approximateMinutes: z\.number\(\)\.int\(\)\.min\(1\)\.max\(1440\)\.optional\(\)/);
  assert.match(
    recapRpc,
    /'approximateMinutes', \([\s\S]*resolution\.value ->> 'approximateMinutes'/,
  );

  const reconciliationUpdates = [...recapRpc.matchAll(/update public\.daily_actions[\s\S]*?where id = v_action\.id/g)]
    .map((match) => match[0])
    .join("\n");
  assert.doesNotMatch(reconciliationUpdates, /estimated_minutes\s*=/);
});

test("omitting actual duration preserves unknown rather than copying the estimate", () => {
  assert.match(
    catchUp,
    /validActualMinutes\(draft\.actualMinutes\) !== null[\s\S]*name=\{`actualMinutes:/,
  );
  assert.match(catchUp, /actualMinutes: ""/);
  assert.doesNotMatch(catchUp, /actualMinutes:\s*action\.estimated_minutes/);
  assert.match(
    transition,
    /approximateMinutes: actualMinutes[\s\S]*\? Number\(actualMinutes\)[\s\S]*: undefined/,
  );
});

test("unplanned completed activity records optional actual duration through existing evidence storage", () => {
  assert.match(completedItem, /<TimeSpentField/);
  assert.match(completedItem, /actualMinutes: normalizedActualMinutes/);
  assert.match(catchUp, /name=\{`unplannedActualMinutes:\$\{item\.id\}`\}/);
  assert.match(
    transition,
    /estimatedMinutes: actualMinutes[\s\S]*\? Number\(actualMinutes\)[\s\S]*: null/,
  );
  assert.match(
    recapRpc,
    /'estimatedMinutes', v_unplanned_minutes/,
  );
  assert.match(calendarHistory, /item\.actualMinutes === null/);
});

test("saved evidence renders with the shared compact duration formatter", () => {
  assert.equal(formatDuration(45), "45m");
  assert.equal(formatDuration(60), "1h");
  assert.equal(formatDuration(75), "1h 15m");
  assert.equal(formatDuration(90), "1h 30m");
  assert.match(experience, /formatDuration\(activity\.actualMinutes\)/);
  assert.match(calendarHistory, /formatDuration\(item\.approximateMinutes\)/);
});

test("Day reflection and existing atomic save/close path stay intact", () => {
  assert.match(catchUp, /name="contextSummary"[\s\S]*value=\{dayContext\}/);
  assert.match(service, /p_context_summary: contextSummary/);
  assert.match(service, /"reconcile_previous_day_direct_v3"/);
  assert.match(
    transition,
    /await dailyLoopService\.reconcilePreviousDay\([\s\S]*resolutions,[\s\S]*unplannedWork,[\s\S]*contextSummary/,
  );
});
