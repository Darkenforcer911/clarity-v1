import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildActionClarityHref,
  buildCalendarCommitmentClarityHref,
  buildDayClarityHref,
  parseClarityInvocation,
  parseActionClarityInvocation,
} from "./clarity-action-context.ts";

const actionId = "11111111-1111-4111-8111-111111111111";
const read = (relativePath) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

test("builds and parses one deterministic Action invocation", () => {
  assert.equal(
    buildActionClarityHref(actionId),
    `/clarity?context=action&actionId=${actionId}`,
  );
  assert.deepEqual(
    parseActionClarityInvocation({ context: "action", actionId }),
    { kind: "daily_action", actionId },
  );
});

test("rejects malformed or unrelated invocation state", () => {
  assert.equal(parseActionClarityInvocation({}), null);
  assert.equal(
    parseActionClarityInvocation({ context: "action", actionId: "not-an-id" }),
    null,
  );
  assert.equal(
    parseActionClarityInvocation({ context: "calendar", actionId }),
    null,
  );
});

test("builds and parses one deterministic date-scoped invocation", () => {
  assert.equal(
    buildDayClarityHref("2026-09-01"),
    "/clarity?context=day&date=2026-09-01",
  );
  assert.deepEqual(
    parseClarityInvocation({ context: "day", date: "2026-09-01" }),
    { kind: "day", localDate: "2026-09-01" },
  );
  assert.equal(
    parseClarityInvocation({ context: "day", date: "2026-02-30" }),
    null,
  );
});

test("builds and parses an occurrence-scoped Calendar invocation", () => {
  assert.equal(
    buildCalendarCommitmentClarityHref(actionId, "2026-09-01"),
    `/clarity?context=calendar&commitmentId=${actionId}&date=2026-09-01`,
  );
  assert.deepEqual(
    parseClarityInvocation({
      context: "calendar",
      commitmentId: actionId,
      date: "2026-09-01",
    }),
    {
      kind: "calendar_commitment",
      commitmentId: actionId,
      localDate: "2026-09-01",
    },
  );
  assert.equal(
    parseClarityInvocation({
      context: "calendar",
      commitmentId: "not-an-id",
      date: "2026-09-01",
    }),
    null,
  );
});

test("Action detail hands context to the persistent Clarity surface", () => {
  const detail = read("../../components/clarity/action-detail.tsx");
  const workspace = read("../../components/clarity/action-workspace.tsx");
  const clarityPage = read("../../app/(app)/clarity/page.tsx");
  const shell = read("../../components/clarity/day-item-workspace-shell.tsx");

  assert.match(detail, /buildActionClarityHref\(action\.id\)/);
  assert.match(detail, /DayItemWorkspaceShell/);
  assert.match(shell, />\s*Ask Clarity\s*</);
  assert.doesNotMatch(workspace, /AskClarityPanel|askClarityAction/);
  assert.match(clarityPage, /parseClarityInvocation/);
  assert.match(clarityPage, /data-slot="clarity-action-context"/);
  assert.match(clarityPage, /Action attached/);
  assert.match(clarityPage, /Conversation isn’t connected in this build yet\./);
  assert.doesNotMatch(clarityPage, /askClarityAction|save_action_assistant_exchange/);
});

test("Calendar context is owner-reloaded and creates no item conversation", () => {
  const calendarService = read("./calendar-service.ts");
  const clarityPage = read("../../app/(app)/clarity/page.tsx");
  const workspace = read("../../components/clarity/calendar-occurrence-workspace.tsx");

  assert.match(workspace, /buildCalendarCommitmentClarityHref/);
  assert.match(clarityPage, /getCalendarCommitmentContext\([\s\S]*commitmentId,[\s\S]*localDate/);
  assert.match(calendarService, /getCalendarCommitmentsForDate\(supabase, localDate\)/);
  assert.match(calendarService, /candidate\.id === commitmentId/);
  assert.match(calendarService, /candidate\.occurrence_date === localDate/);
  assert.match(clarityPage, /data-slot="clarity-calendar-context"/);
  assert.doesNotMatch(clarityPage, /searchParams\.(title|details|time)/);
  assert.doesNotMatch(workspace, /create.*conversation|save_action_assistant_exchange/i);
});

test("context retrieval reuses the owned Action boundary and Life relationships", () => {
  const queries = read("./daily-loop-queries.ts");
  const clarityPage = read("../../app/(app)/clarity/page.tsx");
  const detail = read("../../components/clarity/action-detail.tsx");

  assert.match(clarityPage, /actionWorkspaceService\.getAction\(actionId\)/);
  assert.match(queries, /\.from\("daily_actions"\)[\s\S]*?\.eq\("id", actionId\)[\s\S]*?\.eq\("user_id", user\.id\)/);
  assert.match(queries, /daily_actions_project_owner_fkey/);
  assert.match(queries, /daily_actions_routine_owner_fkey/);
  assert.match(queries, /daily_actions_goal_owner_fkey/);
  assert.match(detail, /Project/);
  assert.match(detail, /recurrenceCopy\(lifeContext\.routine\)/);
  assert.doesNotMatch(detail, /label: "Routine"/);
  assert.match(detail, /Goal/);
});

test("historical Calendar Actions link to the shared Action detail", () => {
  const history = read("../../components/clarity/calendar-history.tsx");
  const detailPage = read("../../app/(app)/today/actions/[actionId]/page.tsx");

  assert.match(
    history,
    /href=\{`\/today\/actions\/\$\{actionId\}\?from=calendar&date=\$\{localDate\}`\}/,
  );
  assert.match(detailPage, /returnToCalendar/);
  assert.match(detailPage, /`\/calendar\?date=\$\{calendarDate\}`/);
});

test("day context reloads canonical owned data rather than trusting URL content", () => {
  const note = read("../../components/clarity/recap-day-context-field.tsx");
  const calendarService = read("./calendar-service.ts");
  const clarityPage = read("../../app/(app)/clarity/page.tsx");

  assert.match(note, /buildDayClarityHref\(localDate\)/);
  assert.match(note, /Talk to Clarity about \$\{day\}/);
  assert.match(clarityPage, /getCalendarPageData\(invocation\.localDate\)/);
  assert.match(clarityPage, /data-slot="clarity-day-context"/);
  assert.match(
    calendarService,
    /\.from\("daily_plans"\)[\s\S]*\.eq\("user_id", authenticatedUserId\)[\s\S]*\.eq\("local_date", localDate\)/,
  );
  assert.doesNotMatch(clarityPage, /searchParams\.(title|outcome|duration)/);
});
