import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (relativePath) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

const proposedPlan = read("../../components/clarity/proposed-plan.tsx");
const proposedAction = read(
  "../../components/clarity/proposed-action-card.tsx",
);
const dailyCommitments = read(
  "../../components/clarity/daily-commitments.tsx",
);
const soFarToday = read("../../components/clarity/so-far-today.tsx");
const actionService = read("./action-workspace-service.ts");
const proposedCompletionMigration = read(
  "../../supabase/migrations/20260807000001_proposed_plan_reconciliation.sql",
);
const actionCorrectionMigration = read(
  "../../supabase/migrations/20260906000001_allow_proposed_action_completion_time_correction.sql",
);
const calendarCorrectionMigration = read(
  "../../supabase/migrations/20260825000004_allow_current_day_occurrence_correction.sql",
);

test("Shape Today uses one accordion owner across Actions and Calendar commitments", () => {
  assert.match(
    proposedPlan,
    /const \[expandedItemKey, setExpandedItemKey\] = useState<string \| null>\(null\)/,
  );
  assert.match(proposedPlan, /const actionKey = `action:\$\{actionId\}`/);
  assert.match(
    proposedPlan,
    /currentItemKey === actionKey \? null : actionKey/,
  );
  assert.match(
    dailyCommitments,
    /expandedItemKey === `commitment:\$\{item\.value\.id\}`/,
  );
  assert.match(
    dailyCommitments,
    /expanded \? `commitment:\$\{item\.value\.id\}` : null/,
  );
  assert.match(
    dailyCommitments,
    /onExpandedChange=\{[\s\S]*onExpandedItemChange[\s\S]*\? \(expanded\)[\s\S]*: undefined/,
  );
  assert.match(
    dailyCommitments,
    /const setExpanded = onExpandedChange \?\? setInternalExpanded/,
  );
});

test("all unfinished proposed Actions can be completed early at the current profile-local time", () => {
  assert.match(
    proposedAction,
    /name="completedTime"[\s\S]*value=\{currentTimeInput\}/,
  );
  assert.match(
    proposedPlan,
    /currentTimeInput=\{formatTimeInput\(now, profile\.timezone\)\}/,
  );
  assert.doesNotMatch(
    proposedAction,
    /timePassed &&[\s\S]{0,500}(Already done|completionAction)/,
  );
  assert.match(
    actionService,
    /plan\.status !== "proposed"[\s\S]*data\.action\.status !== "proposed"[\s\S]*data\.action\.completion_evidence_only/,
  );
  assert.doesNotMatch(
    actionService.slice(actionService.indexOf("async completeProposedAction")),
    /action_type !== "fixed"|!data\.action\.scheduled_time/,
  );
});

test("Action completion and correction keep planned When separate from actual time", () => {
  const completeFunction = proposedCompletionMigration.slice(
    proposedCompletionMigration.indexOf(
      "create function public.complete_proposed_action_v2",
    ),
    proposedCompletionMigration.indexOf(
      "create function public.record_calendar_event_outcome",
    ),
  );

  assert.match(completeFunction, /completed_at = v_completed_at/);
  assert.doesNotMatch(completeFunction, /scheduled_time\s*=/);
  assert.match(
    actionCorrectionMigration,
    /v_plan\.status = 'active'[\s\S]*v_plan\.status = 'proposed'/i,
  );
  assert.match(
    actionCorrectionMigration,
    /set[\s\S]*completed_at = case[\s\S]*completion_time_unknown = p_time_unknown[\s\S]*completion_recorded_at = v_recorded_at/i,
  );
  assert.doesNotMatch(actionCorrectionMigration, /scheduled_time\s*=/i);
  assert.doesNotMatch(actionCorrectionMigration, /update public\.routines/i);
});

test("Calendar occurrence completion records actual time on only that occurrence", () => {
  assert.match(
    dailyCommitments,
    /name="completedTime"[\s\S]*value=\{getLocalTime\(timezone, now\)\}/,
  );
  assert.match(calendarCorrectionMigration, /completed_at = v_completed_at/i);
  assert.match(calendarCorrectionMigration, /where id = v_occurrence\.id/i);
  assert.doesNotMatch(
    calendarCorrectionMigration,
    /update public\.calendar_commitments/i,
  );
});

test("the compact day-item controls use source-neutral primary labels", () => {
  assert.match(proposedAction, />\s*Done\s*</);
  assert.match(proposedAction, />\s*Edit\s*</);
  assert.match(proposedAction, /"Skip today"[\s\S]*"Remove from today"/);
  assert.doesNotMatch(proposedAction, />\s*Edit action\s*</);
  assert.doesNotMatch(proposedAction, />\s*Remove from plan\s*</);

  assert.match(dailyCommitments, />\s*Done\s*</);
  assert.match(dailyCommitments, />\s*Edit\s*</);
  assert.match(dailyCommitments, /"Skip today"[\s\S]*"Remove from today"/);
  assert.match(dailyCommitments, />\s*More\s*/);
  assert.match(dailyCommitments, /data-recurring-day-item-more/);
});

test("completed proposed Actions remain reachable by the same Action ID", () => {
  assert.match(
    soFarToday,
    /href=\{`\/today\/actions\/\$\{action\.id\}`\}/,
  );
  assert.match(soFarToday, /completion_evidence_only/);
});
