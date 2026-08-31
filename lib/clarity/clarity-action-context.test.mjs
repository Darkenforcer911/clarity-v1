import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildActionClarityHref,
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

test("Action detail hands context to the persistent Clarity surface", () => {
  const detail = read("../../components/clarity/action-detail.tsx");
  const workspace = read("../../components/clarity/action-workspace.tsx");
  const clarityPage = read("../../app/(app)/clarity/page.tsx");

  assert.match(detail, /buildActionClarityHref\(action\.id\)/);
  assert.match(detail, />\s*Ask Clarity\s*</);
  assert.doesNotMatch(workspace, /AskClarityPanel|askClarityAction/);
  assert.match(clarityPage, /parseActionClarityInvocation/);
  assert.match(clarityPage, /data-slot="clarity-action-context"/);
  assert.match(clarityPage, /Action attached/);
  assert.match(clarityPage, /Conversation isn’t connected in this build yet\./);
  assert.doesNotMatch(clarityPage, /askClarityAction|save_action_assistant_exchange/);
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
  assert.match(detail, /Routine/);
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
