import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  getVisibleCalendarDailyActions,
  partitionCalendarDailyActions,
} from "./calendar-daily-actions.ts";

const read = (relativePath) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

const actionFields = read("../../components/clarity/action-fields.tsx");
const timeSelector = read("../../components/clarity/time-selector.tsx");
const workspaceActions = read(
  "../../app/(app)/today/action-workspace-actions.ts",
);
const todayActions = read("../../app/(app)/today/actions.ts");
const actionService = read("./action-workspace-service.ts");
const workspaceQuery = read("./daily-loop-queries.ts");
const actionWorkspace = read("../../components/clarity/action-workspace.tsx");
const actionDetail = read("../../components/clarity/action-detail.tsx");
const actionPage = read("../../app/(app)/today/actions/[actionId]/page.tsx");
const calendarService = read("./calendar-service.ts");
const calendarActions = read("../../components/clarity/calendar-daily-actions.tsx");
const completionControl = read(
  "../../components/clarity/action-completion-control.tsx",
);
const undoMigration = read(
  "../../supabase/migrations/20260904000005_allow_current_day_action_completion_undo.sql",
);
const convergenceMigration = read(
  "../../supabase/migrations/20260904000002_action_occurrence_convergence_v1.sql",
);

function action(overrides = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    title: "To test today",
    action_type: "fixed",
    status: "proposed",
    estimated_minutes: 30,
    scheduled_time: "2026-09-04T02:30:00.000Z",
    completed_at: null,
    completion_evidence_only: false,
    actual_minutes: null,
    details: null,
    rescheduled_for: null,
    resolution_note: null,
    sort_order: 0,
    approved_at: null,
    source_routine_id: null,
    daily_plan_id: null,
    local_date: "2026-09-04",
    due_local_date: "2026-09-05",
    due_local_time: null,
    reminder_offsets_minutes: [],
    daily_plans: null,
    ...overrides,
  };
}

test("Due state remains serialized after its disclosure is closed", () => {
  const dueField = actionFields.slice(
    actionFields.indexOf("function ActionDueField"),
    actionFields.indexOf("function formatActionDueDate"),
  );
  const disclosurePosition = dueField.indexOf("<SecondarySettingDisclosure");

  assert.ok(disclosurePosition > 0);
  assert.ok(
    dueField.indexOf(
      '<input type="hidden" name="dueLocalDate" value={dueLocalDate} />',
    ) < disclosurePosition,
  );
  assert.ok(
    dueField.indexOf(
      '<input type="hidden" name="dueLocalTime" value={dueLocalTime} />',
    ) < disclosurePosition,
  );
  assert.doesNotMatch(
    dueField.slice(disclosurePosition),
    /name="dueLocal(?:Date|Time)"/,
  );
  assert.match(timeSelector, /name\?: string/);
});

test("Due date and optional time travel through edit, SQL, reload, and hydration", () => {
  assert.match(workspaceActions, /dueLocalDate: String\(formData\.get\("dueLocalDate"\)/);
  assert.match(workspaceActions, /dueLocalTime: String\(formData\.get\("dueLocalTime"\)/);
  assert.match(actionService, /p_due_local_date: input\.dueLocalDate \|\| undefined/);
  assert.match(actionService, /p_due_local_time: input\.dueLocalTime \|\| undefined/);
  assert.match(
    convergenceMigration,
    /due_local_date = p_due_local_date,[\s\S]*due_local_time = p_due_local_time/,
  );
  assert.match(
    workspaceQuery,
    /\.from\("daily_actions"\)[\s\S]*\.select\(\s*"\*, daily_plans/,
  );
  assert.match(actionWorkspace, /dueLocalDate: action\.due_local_date \?\? ""/);
  assert.match(
    actionWorkspace,
    /dueLocalTime: action\.due_local_time\?\.slice\(0, 5\) \?\? ""/,
  );
});

test("date-only Due, clearing time, and clearing Due preserve null semantics", () => {
  assert.match(
    actionFields,
    /onDateChange\(value\);[\s\S]*if \(!value\) onTimeChange\(""\)/,
  );
  assert.match(
    actionFields,
    /onRemove=\{[\s\S]*dueLocalTime \? \(\) => onTimeChange\(""\)/,
  );
  assert.match(
    actionFields,
    /Clear due[\s\S]*?<\/button>/,
  );
  assert.doesNotMatch(actionFields, /dueLocalTime.*(?:23:59|00:00)/);
});

test("scheduled and Due projections use one canonical Action ID on different dates", () => {
  const canonical = action();
  const friday = {
    ...canonical,
    calendar_projection: "occurrence",
  };
  const saturday = {
    ...canonical,
    calendar_projection: "due",
  };

  assert.deepEqual(partitionCalendarDailyActions([friday]), {
    due: [],
    timed: [friday],
    untimed: [],
  });
  assert.deepEqual(partitionCalendarDailyActions([saturday]), {
    due: [saturday],
    timed: [],
    untimed: [],
  });
  assert.equal(friday.id, saturday.id);
  assert.match(
    calendarService,
    /\.or\(`local_date\.eq\.\$\{localDate\},due_local_date\.eq\.\$\{localDate\}`\)/,
  );
  assert.match(calendarActions, /title="Due"/);
  assert.match(
    calendarActions,
    /href=\{`\/today\/actions\/\$\{action\.id\}\?from=calendar&date=\$\{localDate\}`\}/,
  );
  assert.match(actionDetail, /formatActionDue\(action\.due_local_date, action\.due_local_time\)/);
});

test("Calendar visibility keeps the same future Action for its Due projection", () => {
  const dueProjection = action({ calendar_projection: "due" });
  assert.deepEqual(
    getVisibleCalendarDailyActions([dueProjection], "2026-09-04").map(
      ({ id }) => id,
    ),
    [dueProjection.id],
  );
});

test("current-day completed proposed Actions can reopen and expose Undo done", () => {
  assert.match(
    actionPage,
    /completedCurrentProposalAction[\s\S]*data\.plan\?\.status === "proposed"[\s\S]*data\.action\.status === "completed"[\s\S]*!data\.action\.completion_evidence_only/,
  );
  assert.match(
    actionPage,
    /!editableDatedAction &&[\s\S]*!completedCurrentProposalAction/,
  );
  assert.match(
    actionDetail,
    /activeToday \|\| completedCurrentProposalAction/,
  );
  assert.match(completionControl, /Undo done/);
  assert.doesNotMatch(completionControl, /Mark incomplete/);
});

test("Undo restores the same dated occurrence without mutating its Routine", () => {
  assert.match(undoMigration, /where action\.id = p_daily_action_id[\s\S]*action\.user_id = v_user_id[\s\S]*for update/);
  assert.match(undoMigration, /v_plan\.local_date <> v_today or v_action\.local_date <> v_today/);
  assert.match(
    undoMigration,
    /when v_plan\.status = 'active' then 'active'::public\.daily_action_status[\s\S]*when v_plan\.status = 'proposed'[\s\S]*then 'proposed'::public\.daily_action_status/,
  );
  assert.match(
    undoMigration,
    /update public\.daily_actions[\s\S]*status = v_unfinished_status,[\s\S]*completed_at = null,[\s\S]*completion_recorded_at = null/,
  );
  assert.match(
    undoMigration,
    /where id = v_action\.id[\s\S]*and user_id = v_user_id/,
  );
  assert.doesNotMatch(
    undoMigration,
    /update public\.routines|delete from public\.routines|source_routine_id\s*=/i,
  );
});

test("Undo refreshes Today and Calendar while preserving the existing RPC contract", () => {
  assert.match(todayActions, /setActionCompletion\(actionId, completed\)/);
  for (const path of ["/today", "/today/plan", "/today/active", "/calendar"]) {
    assert.match(todayActions, new RegExp(`revalidatePath\\(\"${path}\"\\)`));
  }
  assert.match(
    undoMigration,
    /create or replace function public\.set_action_completion\([\s\S]*p_daily_action_id uuid,[\s\S]*p_completed boolean/,
  );
  assert.match(
    undoMigration,
    /revoke all on function public\.set_action_completion\(uuid, boolean\)[\s\S]*from public, anon, authenticated/,
  );
  assert.match(
    undoMigration,
    /grant execute on function public\.set_action_completion\(uuid, boolean\)[\s\S]*to authenticated/,
  );
  assert.match(
    convergenceMigration,
    /where action\.status in \('proposed','active'\)[\s\S]*not action\.completion_evidence_only/,
  );
  assert.match(
    convergenceMigration,
    /notification_deliveries\.status = 'cancelled'[\s\S]*status = 'pending'/,
  );
});
