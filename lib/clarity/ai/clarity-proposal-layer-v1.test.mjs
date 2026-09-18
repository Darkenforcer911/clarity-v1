import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ClarityProposalCandidateError,
  formatClarityProposalEffectiveDate,
  validateClarityMemoryUpdateCandidate,
} from "./clarity-proposal.ts";
import {
  buildClaritySystemPrompt,
  buildClarityUserPrompt,
} from "./clarity-prompt.ts";
import { clarityConversationResponseSchema } from "./clarity-response-schema.ts";

const read = (relativePath) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

const migration = read(
  "../../../supabase/migrations/20260918000002_clarity_proposal_layer_v1.sql",
);
const prompt = read("./clarity-prompt.ts");
const assembler = read("./clarity-context-assembler.ts");
const orchestrator = read("./clarity-conversation-orchestrator.ts");
const conversationService = read("./clarity-conversation-service.ts");
const proposalService = read("./clarity-proposal-service.ts");
const proposalActions = read("../../../app/(app)/clarity/proposal-actions.ts");
const conversationUi = read("../../../components/clarity/clarity-conversation.tsx");
const proposalUi = read(
  "../../../components/clarity/clarity-memory-proposal-card.tsx",
);
const lifeMigration = read(
  "../../../supabase/migrations/20260826000002_onboarding_life_model_foundation_v1.sql",
);

const targetId = "11111111-1111-4111-8111-111111111111";

function memoryItem(overrides = {}) {
  return {
    id: targetId,
    memoryClass: "current_state",
    truthState: "fact",
    topic: "current_reality",
    statement: "Currently unemployed",
    confidence: "high",
    materiality: "high",
    observedAt: "2026-09-01T00:00:00.000Z",
    effectiveOn: null,
    reviewAfter: "2026-10-01T00:00:00.000Z",
    confirmedAt: "2026-09-01T00:00:00.000Z",
    freshness: "fresh",
    sourceClasses: ["onboarding_confirmation"],
    ...overrides,
  };
}

function memoryContext(overrides = {}) {
  return {
    durableMemory: [],
    currentState: [memoryItem()],
    staleCurrentState: [],
    materialUnknowns: [],
    omissions: {
      durableMemory: 0,
      currentState: 0,
      materialUnknowns: 0,
    },
    ...overrides,
  };
}

const candidate = {
  type: "memory_update",
  targetMemoryItemId: targetId,
  replacementStatement: "Started an L2 Systems Support role on Monday",
  effectiveOn: "2026-09-14",
  summary: "Started a new role",
  rationale: "This replaces the older unemployment state.",
};

const ordinaryResponse = {
  response: "What kind of role did you start?",
  nextMove: { type: "clarify" },
  understanding: { learned: [] },
  uncertainties: [],
  requiresCurrentVerification: false,
  verificationNeed: null,
  proposalCandidate: null,
};

test("normal Clarity output requires a nullable proposal candidate", () => {
  assert.deepEqual(
    clarityConversationResponseSchema.parse(ordinaryResponse),
    ordinaryResponse,
  );
  assert.throws(() => {
    const missingCandidate = { ...ordinaryResponse };
    delete missingCandidate.proposalCandidate;
    clarityConversationResponseSchema.parse(missingCandidate);
  });
  assert.throws(() =>
    clarityConversationResponseSchema.parse({
      ...ordinaryResponse,
      proposalCandidate: { ...candidate, arbitraryMutation: true },
    }),
  );
});

test("a Memory proposal can reference only an explicitly supplied Current State id", () => {
  assert.deepEqual(
    validateClarityMemoryUpdateCandidate(candidate, memoryContext()),
    candidate,
  );
  assert.throws(
    () =>
      validateClarityMemoryUpdateCandidate(
        { ...candidate, targetMemoryItemId: crypto.randomUUID() },
        memoryContext(),
      ),
    ClarityProposalCandidateError,
  );
  assert.throws(
    () =>
      validateClarityMemoryUpdateCandidate(
        candidate,
        memoryContext({
          currentState: [],
          durableMemory: [memoryItem({ memoryClass: "durable_memory" })],
        }),
      ),
    ClarityProposalCandidateError,
  );
});

test("stale but still active Current State remains an explicit proposal target", () => {
  assert.deepEqual(
    validateClarityMemoryUpdateCandidate(
      candidate,
      memoryContext({
        currentState: [],
        staleCurrentState: [memoryItem({ freshness: "stale" })],
      }),
    ),
    candidate,
  );
});

test("effective dates stay structured and format independently from replacement prose", () => {
  assert.match(
    formatClarityProposalEffectiveDate("2026-09-16"),
    /16.*2026/,
  );
  assert.match(
    migration,
    /normalize_clarity_memory_replacement_statement_v1/,
  );
  assert.match(
    prompt,
    /effectiveOn is the only date source.*replacementStatement date-free/i,
  );
});

test("the common envelope is typed, owner-readable, and never a generic JSON mutation store", () => {
  assert.match(migration, /create table public\.clarity_change_proposals/);
  assert.match(migration, /create table public\.clarity_memory_update_proposals/);
  assert.doesNotMatch(migration, /\b(payload|proposed_changes)\s+jsonb\b/i);
  assert.match(
    migration,
    /alter table public\.clarity_change_proposals force row level security/,
  );
  assert.match(
    migration,
    /alter table public\.clarity_memory_update_proposals force row level security/,
  );
  assert.match(
    migration,
    /revoke all on table public\.clarity_change_proposals[\s\S]*grant select on table public\.clarity_change_proposals to authenticated/,
  );
  assert.doesNotMatch(
    migration,
    /grant (insert|update|delete) on table public\.clarity_(change|memory_update)_proposals/i,
  );
});

test("assistant response and server-resolved proposal persist through one atomic RPC", () => {
  assert.match(migration, /create or replace function public\.append_clarity_response_v2/);
  assert.match(
    migration,
    /from public\.append_clarity_response_v1\([\s\S]*insert into public\.clarity_change_proposals[\s\S]*insert into public\.clarity_memory_update_proposals/,
  );
  assert.match(conversationService, /append_clarity_response_v3/);
  assert.match(conversationService, /p_target_memory_item_id/);
  assert.match(conversationService, /p_proposal_rationale/);
  const metadataBlock = conversationService.match(
    /const metadata = \{[\s\S]*?\} satisfies Json;/,
  )?.[0] ?? "";
  assert.doesNotMatch(metadataBlock, /proposalCandidate/);
});

test("provider candidates are server-validated against the exact assembled Memory context", () => {
  assert.match(assembler, /memory: ClarityMemoryContext/);
  assert.match(assembler, /loadClarityMemoryContext\(supabase, user\.id\)/);
  assert.match(orchestrator, /validateClarityProposalCandidate/);
  assert.match(orchestrator, /presentedResult\.output\.proposalCandidate/);
  assert.match(orchestrator, /context/);
  assert.match(prompt, /targetMemoryItemId must exactly copy the id/i);
  assert.match(prompt, /fresh or stale Current State item/i);
  assert.match(prompt, /Usually set proposalCandidate to null/i);
  assert.match(prompt, /do not repeat an equivalent dismissed proposal/i);
});

test("dismissed corrections remain visible but cannot outrank canonical Memory later", () => {
  const sourceUserMessageId = "22222222-2222-4222-8222-222222222222";
  const systemPrompt = buildClaritySystemPrompt();
  const userPrompt = buildClarityUserPrompt({
    userMessage: "What’s my title?",
    context: {
      memory: memoryContext({
        currentState: [
          memoryItem({
            statement: "Finance Manager",
            topic: "employment",
          }),
        ],
      }),
      proposalHistory: {
        recentDismissedMemoryUpdates: [
          {
            type: "memory_update",
            epistemicStatus: "dismissed_unconfirmed",
            sourceUserMessageId,
            summary: "Correct job title",
            targetMemoryItemId: targetId,
            targetStatementAtProposal: "Finance Manager",
            replacementStatement: "Senior Finance Manager",
            dismissedAt: "2026-09-18T01:00:00.000Z",
          },
        ],
      },
    },
    history: [
      {
        id: sourceUserMessageId,
        role: "user",
        content: "Actually my title is Senior Finance Manager.",
        attachments: [],
        proposal: null,
      },
      {
        id: "33333333-3333-4333-8333-333333333333",
        role: "clarity",
        content: "I can update that.",
        response_to_message_id: sourceUserMessageId,
        attachments: [],
        proposal: {
          type: "memory_update",
          status: "dismissed",
        },
      },
    ],
  });

  assert.match(
    userPrompt,
    /User \[dismissed Memory correction proposal source; unsaved\/unconfirmed on later turns; canonical state still governs\]/,
  );
  assert.match(userPrompt, /"statement":"Finance Manager"/);
  assert.match(userPrompt, /"replacementStatement":"Senior Finance Manager"/);
  assert.match(userPrompt, /"epistemicStatus":"dismissed_unconfirmed"/);
  assert.match(proposalService, /source_user_message_id/);
  assert.match(proposalService, /target_memory_item_id/);
  assert.match(proposalService, /target_statement/);
  assert.match(systemPrompt, /dismissed proposal candidates.*older conversation/i);
  assert.match(systemPrompt, /anchor on current canonical state/i);
  assert.match(systemPrompt, /mention the dismissed correction as unconfirmed/i);
  assert.match(systemPrompt, /must not silently override the active canonical Memory value/i);
});

test("current-turn corrections and later reassertions can still produce a fresh proposal", () => {
  const systemPrompt = buildClaritySystemPrompt();
  assert.match(
    systemPrompt,
    /current_user_message as fresh user-reported evidence for this turn/i,
  );
  assert.match(
    systemPrompt,
    /current-turn correction can be understood and proposed immediately/i,
  );
  assert.match(
    systemPrompt,
    /direct current-turn reassertion is materially newer user evidence and may justify a fresh proposal/i,
  );
  assert.match(systemPrompt, /still creates nothing until Confirm/i);
});

test("confirmation is idempotent, stale-safe, and atomic", () => {
  const executeBody = migration.match(
    /create function public\.execute_clarity_memory_update_proposal_v1[\s\S]*?\n\$\$;/,
  )?.[0] ?? "";
  assert.match(executeBody, /for update/);
  assert.match(executeBody, /if v_proposal\.status = 'executed'/);
  assert.match(executeBody, /v_target\.status <> 'active'/);
  assert.match(executeBody, /expected_target_fingerprint/);
  assert.match(executeBody, /status = 'expired'/);
  assert.match(executeBody, /public\.supersede_clarity_memory_item_v1/);
  assert.match(executeBody, /'clarity_message'/);
  assert.match(executeBody, /status = 'executed'/);
  assert.match(executeBody, /when others[\s\S]*status = 'execution_failed'/);
  assert.match(proposalService, /execute_clarity_memory_update_proposal_v1/);
});

test("Edit and Not now expose only typed owner-scoped transitions", () => {
  assert.match(migration, /create function public\.edit_clarity_memory_update_proposal_v1/);
  assert.match(migration, /p_expected_revision integer/);
  assert.match(migration, /Only a proposed Memory update can be edited/);
  assert.match(migration, /revision = proposal\.revision \+ 1/);
  assert.match(migration, /create function public\.dismiss_clarity_change_proposal_v1/);
  assert.match(migration, /status = 'dismissed'/);
  assert.match(migration, /dismissal_reason = 'not_now'/);
  assert.match(proposalActions, /z\.string\(\)\.trim\(\)\.min\(1\)\.max\(1000\)/);
  assert.doesNotMatch(proposalActions, /JSON\.parse|proposed_changes|payload/);
});

test("the compact inline card is persisted by assistant message and leaves the composer untouched", () => {
  assert.match(conversationService, /loadClarityProposalsForAssistantMessages/);
  assert.match(conversationUi, /item\.role === "clarity" && item\.proposal/);
  assert.match(conversationUi, /ClarityMemoryProposalCard/);
  assert.match(proposalUi, /Update what I know\?/);
  assert.match(proposalUi, /Confirm/);
  assert.match(proposalUi, /Edit/);
  assert.match(proposalUi, /Not now/);
  assert.match(proposalUi, /data-proposal-status/);
  assert.match(proposalUi, /execution_failed/);
  assert.match(proposalUi, /effectiveDateLabel\(proposal\.effectiveOn\)/);
  assert.match(proposalUi, /Effective \$\{formatted\}/);
  assert.match(conversationUi, /proposal\.revision.*proposal\.status/);
  assert.doesNotMatch(proposalUi, /fixed|visualViewport|touchstart|touchmove/);
});

test("existing Life proposal architecture remains unchanged", () => {
  assert.match(lifeMigration, /create table public\.life_model_change_proposals/);
  assert.match(lifeMigration, /create function public\.confirm_life_model_change_proposal/);
  assert.doesNotMatch(migration, /alter table public\.life_model_change_proposals/);
});
