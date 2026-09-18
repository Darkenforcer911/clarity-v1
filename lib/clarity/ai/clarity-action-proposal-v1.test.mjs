import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  clarityActionProposalPlacementCopy,
  ClarityProposalCandidateError,
  formatClarityActionProposalDue,
  resolveClarityActionRelativeDueAt,
  validateClarityActionCreateCandidate,
  validateClarityProposalCandidate,
} from "./clarity-proposal.ts";
import { buildClarityUserPrompt } from "./clarity-prompt.ts";
import { clarityConversationResponseSchema } from "./clarity-response-schema.ts";
import { getLocalDate } from "../date-time.ts";

const read = (relativePath) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

const enumMigration = read(
  "../../../supabase/migrations/20260918000003_add_action_create_proposal_type.sql",
);
const actionMigration = read(
  "../../../supabase/migrations/20260918000004_clarity_action_create_proposals_v1.sql",
);
const prompt = read("./clarity-prompt.ts");
const service = read("./clarity-proposal-service.ts");
const conversationService = read("./clarity-conversation-service.ts");
const actions = read("../../../app/(app)/clarity/proposal-actions.ts");
const clarityPage = read("../../../app/(app)/clarity/page.tsx");
const conversation = read("../../../components/clarity/clarity-conversation.tsx");
const card = read(
  "../../../components/clarity/clarity-action-proposal-card.tsx",
);

const context = {
  profile: {
    localDate: "2026-09-18",
    timezone: "Australia/Melbourne",
  },
};
const boundaryNow = new Date("2026-09-17T14:30:00.000Z");

const candidate = {
  type: "action_create",
  title: "Call the recruiter",
  dueAt: "2026-09-19",
  preferredDay: null,
  durationMinutes: 20,
  summary: "Call the recruiter tomorrow",
  rationale: "You said this is the concrete next step.",
};

test("Action candidates stay strict, nullable, and separate from ordinary replies", () => {
  const response = {
    response: "I can add that when you confirm.",
    nextMove: { type: "recommend" },
    understanding: { learned: [] },
    uncertainties: [],
    requiresCurrentVerification: false,
    verificationNeed: null,
    proposalCandidate: candidate,
  };
  assert.deepEqual(
    clarityConversationResponseSchema.parse(response).proposalCandidate,
    candidate,
  );
  assert.throws(() =>
    clarityConversationResponseSchema.parse({
      ...response,
      proposalCandidate: { ...candidate, recurrence: "daily" },
    }),
  );
  assert.equal(
    validateClarityProposalCandidate(null, {
      ...context,
      memory: { currentState: [], staleCurrentState: [] },
    }),
    null,
  );
});

test("server validation preserves an explicit date-only Due without inventing a time", () => {
  assert.deepEqual(validateClarityActionCreateCandidate(candidate, context), {
    ...candidate,
    actionLocalDate: "2026-09-18",
    dueLocalDate: "2026-09-19",
    dueLocalTime: null,
  });
  assert.match(
    formatClarityActionProposalDue({
      dueLocalDate: "2026-09-19",
      dueLocalTime: null,
    }),
    /^Due /,
  );
  assert.equal(
    formatClarityActionProposalDue({
      dueLocalDate: "2026-09-18",
      dueLocalTime: null,
    }),
    "Due Fri, 18 Sept",
  );
});

test("relative Due dates resolve from canonical profile timezones across a UTC boundary", () => {
  assert.equal(getLocalDate("Australia/Melbourne", boundaryNow), "2026-09-18");
  assert.equal(getLocalDate("America/Los_Angeles", boundaryNow), "2026-09-17");

  const validate = (dueAt, timezone = "Australia/Melbourne") =>
    validateClarityActionCreateCandidate(
      { ...candidate, dueAt },
      {
        profile: {
          timezone,
          localDate: getLocalDate(timezone, boundaryNow),
        },
      },
    );

  assert.deepEqual(
    ["today", "tomorrow", "tonight", "2026-09-25"].map((dueAt) => {
      const result = validate(dueAt);
      return [result.dueLocalDate, result.dueLocalTime];
    }),
    [
      ["2026-09-18", null],
      ["2026-09-19", null],
      ["2026-09-18", null],
      ["2026-09-25", null],
    ],
  );
  assert.equal(validate("today", "America/Los_Angeles").dueLocalDate, "2026-09-17");
  assert.equal(validate("tomorrow", "America/Los_Angeles").dueLocalDate, "2026-09-18");
});

test("relative weekdays and user-supplied local clock times resolve without UTC conversion", () => {
  assert.deepEqual(resolveClarityActionRelativeDueAt("this_friday", "2026-09-18"), {
    localDate: "2026-09-18",
    localTime: null,
  });
  assert.deepEqual(resolveClarityActionRelativeDueAt("next_monday", "2026-09-18"), {
    localDate: "2026-09-21",
    localTime: null,
  });
  assert.deepEqual(resolveClarityActionRelativeDueAt("todayT18:00", "2026-09-18"), {
    localDate: "2026-09-18",
    localTime: "18:00",
  });
});

test("the provider contract keeps relative language for canonical server resolution", () => {
  const response = {
    response: "I can add that when you confirm.",
    nextMove: { type: "recommend" },
    understanding: { learned: [] },
    uncertainties: [],
    requiresCurrentVerification: false,
    verificationNeed: null,
    proposalCandidate: { ...candidate, dueAt: "today" },
  };
  assert.equal(
    clarityConversationResponseSchema.parse(response).proposalCandidate?.dueAt,
    "today",
  );
  assert.match(prompt, /Preserve relative Due language/);
  assert.match(prompt, /canonical profile timezone, never UTC/);
});

test("the live-equivalent certification request resolves to Melbourne today with no fabricated time", () => {
  const result = validateClarityActionCreateCandidate(
    {
      ...candidate,
      title: "Renew accounting certification",
      dueAt: "today",
      durationMinutes: 60,
      summary: "Renew accounting certification today",
    },
    context,
  );
  assert.equal(result.actionLocalDate, "2026-09-18");
  assert.equal(result.dueLocalDate, "2026-09-18");
  assert.equal(result.dueLocalTime, null);
  assert.equal(result.durationMinutes, 60);
});

test("Action proposal placement copy follows persisted Due date relative to profile-local today", () => {
  assert.deepEqual(
    clarityActionProposalPlacementCopy("2026-09-18", "2026-09-18"),
    { proposed: "Add to Today?", executed: "Added to Today" },
  );
  assert.deepEqual(
    clarityActionProposalPlacementCopy("2026-09-19", "2026-09-18"),
    { proposed: "Add Action?", executed: "Added for Saturday" },
  );
  assert.deepEqual(
    clarityActionProposalPlacementCopy("2026-09-21", "2026-09-18"),
    { proposed: "Add Action?", executed: "Added for Monday" },
  );
  assert.deepEqual(
    clarityActionProposalPlacementCopy(null, "2026-09-18"),
    { proposed: "Add Action?", executed: "Added" },
  );
});

test("an exact Due timestamp becomes canonical profile-local date and time", () => {
  const result = validateClarityActionCreateCandidate(
    {
      ...candidate,
      dueAt: "2026-09-19T12:30:00+10:00",
      preferredDay: "2026-09-19",
    },
    context,
  );
  assert.equal(result.actionLocalDate, "2026-09-19");
  assert.equal(result.dueLocalDate, "2026-09-19");
  assert.equal(result.dueLocalTime, "12:30");
});

test("server validation rejects past Actions and Due dates before the Action", () => {
  assert.throws(
    () =>
      validateClarityActionCreateCandidate(
        { ...candidate, preferredDay: "2026-09-17", dueAt: null },
        context,
      ),
    ClarityProposalCandidateError,
  );
  assert.throws(
    () =>
      validateClarityActionCreateCandidate(
        {
          ...candidate,
          preferredDay: "2026-09-20",
          dueAt: "2026-09-19",
        },
        context,
      ),
    ClarityProposalCandidateError,
  );
});

test("the typed Action proposal is private, atomic, and executes only through the canonical Action RPC", () => {
  assert.match(enumMigration, /add value if not exists 'action_create'/);
  assert.match(actionMigration, /create table public\.clarity_action_create_proposals/);
  assert.match(actionMigration, /force row level security/);
  assert.match(actionMigration, /grant select on table public\.clarity_action_create_proposals to authenticated/);
  assert.doesNotMatch(
    actionMigration,
    /grant (insert|update|delete) on table public\.clarity_action_create_proposals/i,
  );
  assert.match(actionMigration, /create function public\.append_clarity_response_v3/);
  assert.match(
    actionMigration,
    /insert into public\.clarity_change_proposals[\s\S]*insert into public\.clarity_action_create_proposals/,
  );
  assert.match(
    actionMigration,
    /public\.create_action_occurrence_v1\([\s\S]*p_recurrence_pattern => 'none'/,
  );
  assert.doesNotMatch(prompt, /execute_clarity_action_create_proposal_v1/);
  assert.match(conversationService, /append_clarity_response_v3/);
});

test("Confirm, Edit, and Not now retain typed owner-scoped semantics", () => {
  const execute = actionMigration.match(
    /create function public\.execute_clarity_action_create_proposal_v1[\s\S]*?\n\$\$;/,
  )?.[0] ?? "";
  assert.match(execute, /for update/);
  assert.match(execute, /if v_proposal\.status = 'executed'/);
  assert.match(execute, /result_daily_action_id/);
  assert.match(actionMigration, /p_expected_revision integer/);
  assert.match(actionMigration, /revision = proposal\.revision \+ 1/);
  assert.match(actions, /revalidatePath\("\/today"\)/);
  assert.match(actions, /revalidatePath\("\/calendar"\)/);
  assert.match(actions, /dismissClarityChangeProposal/);
  assert.match(service, /execute_clarity_action_create_proposal_v1/);
  assert.match(service, /edit_clarity_action_create_proposal_v1/);
});

test("dismissed Action evidence suppresses immediate repetition without becoming canonical", () => {
  const sourceUserMessageId = "22222222-2222-4222-8222-222222222222";
  const userPrompt = buildClarityUserPrompt({
    userMessage: "What should I do next?",
    context: {
      proposalHistory: {
        recentDismissedMemoryUpdates: [],
        recentDismissedActionCreates: [
          {
            type: "action_create",
            epistemicStatus: "dismissed_unconfirmed",
            sourceUserMessageId,
            summary: "Call the recruiter",
            title: "Call the recruiter",
            localDate: "2026-09-18",
            dueLocalDate: "2026-09-19",
            dueLocalTime: null,
            dismissedAt: "2026-09-18T01:00:00.000Z",
          },
        ],
      },
    },
    history: [
      {
        id: sourceUserMessageId,
        role: "user",
        content: "I need to call the recruiter.",
        attachments: [],
        proposal: null,
      },
      {
        id: "33333333-3333-4333-8333-333333333333",
        role: "clarity",
        content: "I can add that.",
        response_to_message_id: sourceUserMessageId,
        attachments: [],
        proposal: { type: "action_create", status: "dismissed" },
      },
    ],
  });

  assert.match(userPrompt, /dismissed Action creation proposal source/);
  assert.match(userPrompt, /"title":"Call the recruiter"/);
  assert.match(prompt, /Do not repeat an equivalent dismissed proposal immediately/i);
  assert.match(prompt, /direct current-turn reassertion.*fresh proposal/i);
});

test("the inline Action card uses the existing conversation and exposes no hidden mutation fields", () => {
  assert.match(conversation, /ClarityActionProposalCard/);
  assert.match(conversation, /item\.proposal\.type === "memory_update"/);
  assert.match(card, /placementCopy\.proposed/);
  assert.match(card, /profileLocalDate/);
  assert.match(card, /Confirm/);
  assert.match(card, /Edit/);
  assert.match(card, /Not now/);
  assert.match(card, /placementCopy\.executed/);
  assert.match(card, /No Action was created\./);
  assert.match(clarityPage, /profileLocalDate: getLocalDate\(profile\.timezone\)/);
  assert.match(conversation, /profileLocalDate=\{profileLocalDate\}/);
  assert.match(actions, /message: "Action added\."/);
  assert.doesNotMatch(card, /recurrence|reminder|whenTime|dailyPlanId/);
});

test("the policy keeps Action, Calendar, and Memory boundaries explicit", () => {
  assert.match(prompt, /specific, actionable, worth tracking/i);
  assert.match(prompt, /Do not turn every recommendation into a task/i);
  assert.match(prompt, /A Calendar item is something that happens at a specific time/i);
  assert.match(prompt, /memory_update replaces one existing Current State item/i);
  assert.match(prompt, /Return at most one proposal candidate in a turn/i);
  assert.match(prompt, /do not repeat an equivalent dismissed proposal immediately/i);
});
