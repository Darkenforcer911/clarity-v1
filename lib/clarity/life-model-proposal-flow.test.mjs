import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildMentorLifeProposal,
  interpretLifeIntent,
} from "./life-model-proposal.ts";

const viewSource = readFileSync(
  new URL("../../components/clarity/life-model-view.tsx", import.meta.url),
  "utf8",
);
const flowSource = readFileSync(
  new URL("../../components/clarity/add-to-life-flow.tsx", import.meta.url),
  "utf8",
);
const actionsSource = readFileSync(
  new URL("../../app/(app)/life-model/proposal-actions.ts", import.meta.url),
  "utf8",
);
const mutationsSource = readFileSync(
  new URL("./life-model-mutations.ts", import.meta.url),
  "utf8",
);
const navigationSource = readFileSync(
  new URL("./life-model-navigation.ts", import.meta.url),
  "utf8",
);
const migrationSource = readFileSync(
  new URL(
    "../../supabase/migrations/20260826000002_onboarding_life_model_foundation_v1.sql",
    import.meta.url,
  ),
  "utf8",
);

const context = {
  areas: [{ id: "11111111-1111-4111-8111-111111111111", name: "Career" }],
  currentDirectionGoalIds: ["22222222-2222-4222-8222-222222222222"],
  localDate: "2026-08-26",
};

function ids() {
  const values = [
    "33333333-3333-4333-8333-333333333333",
    "44444444-4444-4444-8444-444444444444",
    "55555555-5555-4555-8555-555555555555",
  ];
  return () => values.shift();
}

test("Add or change something opens intent review and never performs a direct canonical write", () => {
  assert.match(viewSource, /href=\{mentorLifeChangeHref\}/);
  assert.match(viewSource, /Talk to Mentor/);
  assert.match(navigationSource, /\/life-model\/add\?entry=life-change/);
  assert.match(navigationSource, /possible change to their Life Model/);
  assert.match(flowSource, /What is changing\?/);
  assert.match(flowSource, /Review proposal/);
  assert.doesNotMatch(flowSource, /\.from\(|\.insert\(|\.update\(|\.delete\(/);
});

test("deterministic interpretation remains editable and conservative", () => {
  const draft = interpretLifeIntent("I want to learn piano.", context.areas);
  assert.equal(draft.kind, "goal");
  assert.equal(draft.areaName, "Personal Growth");
  assert.equal(draft.title, "Learn piano");
  assert.match(flowSource, /Edit proposal/);
});

test("creating a proposal and confirming it are separate server actions", () => {
  assert.match(actionsSource, /createMentorLifeProposalAction/);
  assert.match(actionsSource, /createMentorLifeModelChangeProposal\(built\)/);
  assert.match(actionsSource, /confirmMentorLifeProposalAction/);
  assert.match(actionsSource, /confirmLifeModelChangeProposal/);
  assert.doesNotMatch(
    actionsSource.match(/createMentorLifeProposalAction[\s\S]*?redirect\(`\/life-model\/proposals/)[0],
    /confirmLifeModelChangeProposal/,
  );
});

test("a Goal is not implicitly added to Current Direction", () => {
  const proposal = buildMentorLifeProposal(
    {
      intent: "I want a stronger career.",
      kind: "goal",
      existingAreaId: context.areas[0].id,
      areaName: "Career",
      title: "Build a stronger career",
      description: "I want a stronger career.",
      desiredState: null,
      routineCadence: "weekly",
      routineEstimatedMinutes: 30,
      includeInCurrentDirection: false,
      directionSummary: null,
      directionRationale: null,
    },
    context,
    ids(),
  );
  assert.deepEqual(
    proposal.proposedChanges.operations.map((operation) => operation.type),
    ["create_goal"],
  );
  const goal = proposal.proposedChanges.operations[0];
  assert.equal("target_start_date" in goal, false);
  assert.equal("target_end_date" in goal, false);
  assert.equal("target_confidence" in goal, false);
});

test("an explicit Current Direction choice preserves existing priorities and adds the Goal", () => {
  const proposal = buildMentorLifeProposal(
    {
      intent: "I want to lead my team.",
      kind: "goal",
      existingAreaId: context.areas[0].id,
      areaName: "Career",
      title: "Lead my team",
      description: "I want to lead my team.",
      desiredState: null,
      routineCadence: "weekly",
      routineEstimatedMinutes: 30,
      includeInCurrentDirection: true,
      directionSummary: "Grow into team leadership",
      directionRationale: "I chose to prioritise it.",
    },
    context,
    ids(),
  );
  const goal = proposal.proposedChanges.operations[0];
  const direction = proposal.proposedChanges.operations[1];
  assert.equal(direction.type, "set_current_direction");
  assert.deepEqual(direction.goal_ids, [context.currentDirectionGoalIds[0], goal.id]);
});

test("confirmation is atomic and rejection never mutates canonical Life rows", () => {
  assert.match(
    migrationSource,
    /The proposal becomes accepted inside this transaction before canonical[\s\S]*Any later failure rolls the status and every write back/,
  );
  const rejectBody = migrationSource.match(
    /create function public\.reject_life_model_change_proposal[\s\S]*?\n\$\$;/,
  )?.[0] ?? "";
  assert.match(rejectBody, /update public\.life_model_change_proposals/);
  assert.doesNotMatch(rejectBody, /insert into public\.(goals|projects|routines|current_contexts)/);
});

test("proposal writes remain ownership-safe RPC calls with no direct table mutations", () => {
  for (const rpc of [
    "create_life_model_change_proposal",
    "confirm_life_model_change_proposal",
    "reject_life_model_change_proposal",
  ]) {
    assert.match(mutationsSource, new RegExp(`"${rpc}"`));
  }
  assert.doesNotMatch(mutationsSource, /\.from\(|\.insert\(|\.update\(|\.delete\(/);
  assert.match(migrationSource, /v_user_id uuid := auth\.uid\(\)/);
  assert.match(migrationSource, /and user_id = v_user_id/);
});
