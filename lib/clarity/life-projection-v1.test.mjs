import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildLifeProjection,
  hasLifeProjectionContent,
} from "./life-projection.ts";

const serviceSource = readFileSync(
  new URL("./life-model-service.ts", import.meta.url),
  "utf8",
);
const memoryServiceSource = readFileSync(
  new URL("./ai/clarity-memory-service.ts", import.meta.url),
  "utf8",
);

const id = (suffix) => `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`;

let memoryItemSequence = 100;

function memoryItem(overrides = {}) {
  memoryItemSequence += 1;
  return {
    id: id(String(memoryItemSequence)),
    memoryClass: "current_state",
    truthState: "fact",
    topic: "current_reality",
    statement: "Works as a Finance Manager.",
    confidence: "high",
    materiality: "medium",
    observedAt: "2026-09-18T00:00:00.000Z",
    effectiveOn: "2026-09-16",
    reviewAfter: "2026-10-18T00:00:00.000Z",
    confirmedAt: "2026-09-18T00:00:00.000Z",
    freshness: "fresh",
    sourceClasses: ["onboarding_confirmation"],
    ...overrides,
  };
}

function memoryContext(overrides = {}) {
  return {
    durableMemory: [],
    currentState: [],
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

function lifeModel(overrides = {}) {
  return {
    areas: [],
    openQuestions: [],
    currentDirection: null,
    relationships: { dailyActions: [], calendarCommitments: [] },
    ...overrides,
  };
}

function profile(overrides = {}) {
  return { name: null, city: null, country: null, ...overrides };
}

function build({ profile: profileValue, life, memory } = {}) {
  return buildLifeProjection({
    profile: profileValue ?? profile(),
    life: life ?? lifeModel(),
    memory: memory ?? memoryContext(),
  });
}

test("confirmed onboarding Memory produces a bounded meaningful Life projection", () => {
  const projection = build({
    memory: memoryContext({
      currentState: [
        memoryItem({ statement: "Works as a Finance Manager." }),
        memoryItem({
          id: id("2"),
          topic: "constraints",
          statement: "Has a spouse, child, and mortgage.",
        }),
        memoryItem({
          id: id("3"),
          topic: "current_priority_or_pressure",
          statement: "Plans to keep stable income while testing landscaping on the side.",
          materiality: "high",
        }),
      ],
      durableMemory: [
        memoryItem({
          id: id("4"),
          memoryClass: "durable_memory",
          topic: "behavioral_evidence",
          statement: "Completed four paid landscaping jobs with early referral evidence.",
          freshness: "durable",
          reviewAfter: null,
        }),
        memoryItem({
          id: id("5"),
          memoryClass: "durable_memory",
          topic: "desired_future",
          statement: "Eventually wants to build a landscaping business.",
          freshness: "durable",
          reviewAfter: null,
        }),
      ],
    }),
  });

  assert.deepEqual(projection.currentPosition?.items, [
    "You work as a Finance Manager.",
    "You’re balancing family responsibilities and a mortgage.",
    "You completed four paid landscaping jobs with early referral evidence.",
  ]);
  assert.deepEqual(projection.currentDirection?.items, [
    "You plan to keep stable income while testing landscaping on the side.",
  ]);
  assert.deepEqual(projection.future?.items, [
    "You eventually want to build a landscaping business.",
  ]);
});

test("rich granular Memory is compressed into a concise second-person map", () => {
  const projection = build({
    profile: profile({ name: "Daniel" }),
    memory: memoryContext({
      currentState: [
        memoryItem({
          statement: "Daniel works as a Finance Manager.",
          materiality: "high",
        }),
        memoryItem({
          topic: "constraints",
          statement: "Daniel has a spouse and child.",
          materiality: "high",
        }),
        memoryItem({
          topic: "constraints",
          statement: "Daniel has a mortgage.",
          materiality: "high",
        }),
        memoryItem({
          topic: "constraints",
          statement: "Daniel has roughly $4k in monthly obligations.",
        }),
        memoryItem({
          topic: "capabilities_and_assets",
          statement: "Daniel has about $18k saved and owns basic tools.",
          materiality: "high",
        }),
        memoryItem({
          topic: "current_priority_or_pressure",
          statement: "Daniel plans to protect stable income while testing landscaping.",
          materiality: "high",
        }),
      ],
      durableMemory: [
        memoryItem({
          memoryClass: "durable_memory",
          topic: "behavioral_evidence",
          statement: "Daniel completed four paid landscaping jobs through early referrals.",
          materiality: "high",
          freshness: "durable",
          reviewAfter: null,
        }),
      ],
    }),
  });

  assert.deepEqual(projection.currentPosition?.items, [
    "You work as a Finance Manager.",
    "You’re balancing family responsibilities, a mortgage, and financial obligations.",
    "You completed four paid landscaping jobs through early referrals.",
  ]);
  assert.equal(projection.currentDirection?.items.length, 1);
  assert.doesNotMatch(JSON.stringify(projection), /Daniel|\$18k|\$4k/);
});

test("high-materiality evidence outranks minor supporting facts", () => {
  const projection = build({
    memory: memoryContext({
      currentState: [
        memoryItem({ statement: "Works as a Finance Manager." }),
        memoryItem({
          topic: "constraints",
          statement: "Has a discounted parking permit.",
          materiality: "low",
        }),
        memoryItem({
          topic: "capabilities_and_assets",
          statement: "Owns a spare garden hose.",
          materiality: "low",
        }),
      ],
      durableMemory: [
        memoryItem({
          memoryClass: "durable_memory",
          topic: "behavioral_evidence",
          statement: "Completed four paid jobs with repeat customer demand.",
          materiality: "high",
          freshness: "durable",
          reviewAfter: null,
        }),
      ],
    }),
  });

  assert.deepEqual(projection.currentPosition?.items, [
    "You work as a Finance Manager.",
    "You completed four paid jobs with repeat customer demand.",
  ]);
  assert.doesNotMatch(JSON.stringify(projection), /parking permit|garden hose/);
});

test("each primary section owns its meaning instead of repeating it", () => {
  const sharedDirection = "Plans to build a landscaping business gradually.";
  const projection = build({
    memory: memoryContext({
      currentState: [
        memoryItem({
          topic: "current_priority_or_pressure",
          statement: sharedDirection,
          materiality: "high",
        }),
      ],
      durableMemory: [
        memoryItem({
          memoryClass: "durable_memory",
          topic: "desired_future",
          statement: sharedDirection,
          freshness: "durable",
          reviewAfter: null,
        }),
      ],
      materialUnknowns: [
        memoryItem({
          truthState: "unknown",
          topic: "material_unknown",
          statement: sharedDirection,
          materiality: "high",
        }),
      ],
    }),
  });

  assert.deepEqual(projection.currentDirection?.items, [
    "You plan to build a landscaping business gradually.",
  ]);
  assert.equal(projection.future, null);
  assert.deepEqual(projection.learning, []);
});

test("a confirmed Memory supersession changes the next projection read", () => {
  const before = build({
    memory: memoryContext({
      currentState: [memoryItem({ statement: "Works as a Finance Manager." })],
    }),
  });
  const after = build({
    memory: memoryContext({
      currentState: [
        memoryItem({ statement: "Works as a Senior Finance Manager." }),
      ],
    }),
  });

  assert.deepEqual(before.currentPosition?.items, [
    "You work as a Finance Manager.",
  ]);
  assert.deepEqual(after.currentPosition?.items, [
    "You work as a Senior Finance Manager.",
  ]);
  assert.doesNotMatch(JSON.stringify(after), /Works as a Finance Manager\./);
});

test("pending and dismissed proposals cannot affect projection because only canonical Life and active Memory are read", () => {
  assert.match(serviceSource, /loadClarityMemoryContext\(supabase, user\.id\)/);
  assert.doesNotMatch(serviceSource, /loadClarityProposalContext|clarity_change_proposals/);
  assert.doesNotMatch(
    readFileSync(new URL("./life-projection.ts", import.meta.url), "utf8"),
    /proposalHistory|clarity_change_proposals|replacementStatement/,
  );
});

test("stale Current State is never presented as fresh position or direction", () => {
  const projection = build({
    memory: memoryContext({
      staleCurrentState: [
        memoryItem({
          statement: "Still works in retail.",
          freshness: "stale",
          materiality: "high",
        }),
      ],
    }),
  });

  assert.equal(projection.currentPosition, null);
  assert.equal(projection.currentDirection, null);
  assert.deepEqual(projection.learning, [
    {
      kind: "needs_review",
      text: "Do you still work in retail?",
    },
  ]);
});

test("projection copy uses one concise second-person voice", () => {
  const projection = build({
    profile: profile({ name: "Daniel" }),
    memory: memoryContext({
      currentState: [
        memoryItem({ statement: "Daniel works as a Finance Manager." }),
        memoryItem({
          topic: "current_priority_or_pressure",
          statement:
            "Daniel plans to keep stable income while testing landscaping on the side.",
          materiality: "high",
        }),
      ],
      durableMemory: [
        memoryItem({
          memoryClass: "durable_memory",
          topic: "desired_future",
          statement:
            "Daniel eventually wants to build his own landscaping business.",
          freshness: "durable",
          reviewAfter: null,
        }),
      ],
      materialUnknowns: [
        memoryItem({
          truthState: "unknown",
          topic: "material_unknown",
          statement:
            "Demand and customer acquisition beyond Daniel’s warm network remain untested for landscaping.",
          materiality: "high",
        }),
      ],
    }),
  });

  assert.deepEqual(projection.future?.items, [
    "You eventually want to build your own landscaping business.",
  ]);
  assert.deepEqual(projection.learning, [
    {
      kind: "unknown",
      text: "Can you consistently win landscaping customers beyond friends and referrals?",
    },
  ]);
  assert.doesNotMatch(JSON.stringify(projection), /Daniel|Still unclear:/);
  assert.equal(
    [
      ...(projection.currentPosition?.items ?? []),
      ...(projection.currentDirection?.items ?? []),
      ...(projection.future?.items ?? []),
      ...projection.learning.map((item) => item.text),
    ].every((item) => item.split(/\s+/).length <= 20),
    true,
  );
  assert.equal(projection.currentDirection?.items.length, 1);
  assert.equal(projection.future?.items.length, 1);
});

test("superseded employment premises are removed while valid strategy and uncertainty survive", () => {
  const projection = build({
    profile: profile({ name: "Daniel" }),
    life: lifeModel({
      areas: [
        canonicalArea(id("8"), {
          currentState: {
            summary: "Started working as a Finance Manager at another company.",
            as_of_date: "2026-09-16",
            created_via: "ai_confirmed",
            source_proposal_id: id("9"),
            confirmed_at: "2026-09-18T00:00:00Z",
            created_at: "2026-09-18T00:00:00Z",
            updated_at: "2026-09-18T00:00:00Z",
          },
        }),
      ],
    }),
    memory: memoryContext({
      currentState: [
        memoryItem({
          topic: "current_priority_or_pressure",
          statement:
            "Daniel is not ready to leave accounting yet because it provides stable income while he tests landscaping.",
          materiality: "high",
        }),
      ],
      materialUnknowns: [
        memoryItem({
          truthState: "unknown",
          topic: "material_unknown",
          statement:
            "Daniel is an accountant earning around $105,000, but his tenure and career stage are unknown.",
          materiality: "high",
        }),
        memoryItem({
          id: id("12"),
          truthState: "unknown",
          topic: "material_unknown",
          statement:
            "Whether landscaping consistently wins customers beyond referrals is unknown.",
          materiality: "high",
        }),
      ],
    }),
  });

  assert.deepEqual(projection.currentPosition?.items, [
    "You started working as a Finance Manager at another company.",
  ]);
  assert.deepEqual(projection.currentDirection?.items, [
    "Keep stable employment while testing landscaping.",
  ]);
  assert.deepEqual(projection.learning, [
    {
      kind: "unknown",
      text: "Does landscaping consistently win customers beyond referrals?",
    },
  ]);
  assert.doesNotMatch(JSON.stringify(projection), /Daniel|accountant|accounting|105,000/);
});

test("canonical Current Direction and Desired State outrank derived Memory", () => {
  const areaId = id("10");
  const projection = build({
    life: lifeModel({
      areas: [canonicalArea(areaId)],
      currentDirection: {
        id: id("11"),
        summary: "Protect income while validating the business.",
        rationale: "This keeps family risk bounded.",
        started_on: "2026-09-18",
        review_on: null,
        created_via: "user_stated",
        source_proposal_id: null,
        confirmed_at: "2026-09-18T00:00:00Z",
        superseded_at: null,
        created_at: "2026-09-18T00:00:00Z",
        updated_at: "2026-09-18T00:00:00Z",
        goals: [],
      },
    }),
    memory: memoryContext({
      currentState: [
        memoryItem({
          topic: "current_priority_or_pressure",
          statement: "Immediately leave salaried work.",
        }),
      ],
      durableMemory: [
        memoryItem({
          memoryClass: "durable_memory",
          topic: "desired_future",
          statement: "Move abroad.",
          freshness: "durable",
          reviewAfter: null,
        }),
      ],
    }),
  });

  assert.deepEqual(projection.currentDirection, {
    source: "canonical",
    items: ["Protect income while validating the business."],
    detail: null,
  });
  assert.deepEqual(projection.future?.items, ["Build a reliable outdoor business."]);
});

test("canonical area state replaces conflicting Memory current reality while other dimensions can still contribute", () => {
  const area = canonicalArea(id("15"), {
    currentState: {
      summary: "Works as a confirmed Senior Finance Manager.",
      as_of_date: "2026-09-18",
      created_via: "user_stated",
      source_proposal_id: null,
      confirmed_at: "2026-09-18T00:00:00Z",
      created_at: "2026-09-18T00:00:00Z",
      updated_at: "2026-09-18T00:00:00Z",
    },
  });
  const projection = build({
    life: lifeModel({ areas: [area] }),
    memory: memoryContext({
      currentState: [
        memoryItem({ statement: "Works as an outdated Finance Manager." }),
        memoryItem({
          id: id("16"),
          topic: "constraints",
          statement: "Supports a family and mortgage.",
        }),
      ],
    }),
  });

  assert.deepEqual(projection.currentPosition, {
    source: "combined",
    items: [
      "You work as a confirmed Senior Finance Manager.",
      "You’re balancing family responsibilities and a mortgage.",
    ],
    detail: null,
  });
  assert.doesNotMatch(JSON.stringify(projection), /outdated Finance Manager/);
});

test("canonical Goals, Projects, and Routines stay canonical instead of being copied from Memory", () => {
  const area = canonicalArea(id("20"), {
    goals: [
      {
        id: id("21"),
        title: "Goal",
        desired_outcome: "Reach the canonical goal outcome.",
        status: "active",
      },
    ],
    projects: [{ id: id("22"), title: "Project" }],
    routines: [{ id: id("23"), title: "Routine" }],
  });
  const life = lifeModel({ areas: [area] });
  const projection = build({ life });

  assert.equal(life.areas[0].goals.length, 1);
  assert.equal(life.areas[0].projects.length, 1);
  assert.equal(life.areas[0].routines.length, 1);
  assert.equal(Object.hasOwn(projection, "goals"), false);
  assert.equal(Object.hasOwn(projection, "projects"), false);
  assert.equal(Object.hasOwn(projection, "routines"), false);
  assert.equal(projection.currentDirection, null);
});

test("partial profile information produces a useful partial projection", () => {
  const projection = build({
    profile: profile({ city: "Melbourne", country: "Australia" }),
  });

  assert.deepEqual(projection.currentPosition?.items, [
    "You’re based in Melbourne, Australia.",
  ]);
  assert.equal(projection.currentDirection, null);
  assert.equal(projection.future, null);
});

test("material unknowns remain unknown and do not leak into current truth", () => {
  const projection = build({
    memory: memoryContext({
      materialUnknowns: [
        memoryItem({
          truthState: "unknown",
          topic: "material_unknown",
          statement: "Whether demand extends beyond referrals is unknown.",
          materiality: "high",
        }),
      ],
    }),
  });

  assert.equal(projection.currentPosition, null);
  assert.deepEqual(projection.learning, [
    {
      kind: "unknown",
      text: "Does demand extend beyond referrals?",
    },
  ]);
});

test("only the three most consequential unknowns reach the Life page", () => {
  const projection = build({
    memory: memoryContext({
      materialUnknowns: [
        memoryItem({
          id: id("301"),
          truthState: "unknown",
          topic: "material_unknown",
          statement: "Whether the route can replace income is unknown.",
          materiality: "high",
        }),
        memoryItem({
          id: id("302"),
          truthState: "unknown",
          topic: "material_unknown",
          statement: "Whether demand extends beyond referrals is unknown.",
          materiality: "high",
        }),
        memoryItem({
          id: id("303"),
          truthState: "unknown",
          topic: "material_unknown",
          statement: "Whether the weekly schedule is sustainable is unknown.",
          materiality: "medium",
        }),
        memoryItem({
          id: id("304"),
          truthState: "unknown",
          topic: "material_unknown",
          statement: "Whether another option is preferable is unknown.",
          materiality: "medium",
        }),
        memoryItem({
          id: id("305"),
          truthState: "unknown",
          topic: "material_unknown",
          statement: "Preferred tool colour is unknown.",
          materiality: "low",
        }),
      ],
    }),
  });

  assert.equal(projection.learning.length, 3);
  assert.equal(
    projection.learning.every(
      (item) => item.text.endsWith("?") && item.text.split(/\s+/).length <= 18,
    ),
    true,
  );
  assert.deepEqual(
    projection.learning.slice(0, 2).map((item) => item.text),
    [
      "Can the route replace income?",
      "Does demand extend beyond referrals?",
    ],
  );
  assert.doesNotMatch(JSON.stringify(projection.learning), /tool colour/);
});

test("Life projection reads remain bound to the authenticated owner", () => {
  assert.match(serviceSource, /getAuthenticatedUserAndProfile\(\)/);
  assert.match(serviceSource, /loadClarityMemoryContext\(supabase, user\.id\)/);
  assert.match(memoryServiceSource, /\.eq\("user_id", userId\)/);
  assert.match(memoryServiceSource, /\.eq\("status", "active"\)/);
});

test("an empty user receives a valid empty projection", () => {
  const projection = build();
  assert.deepEqual(projection, {
    currentPosition: null,
    currentDirection: null,
    future: null,
    learning: [],
  });
  assert.equal(hasLifeProjectionContent(projection), false);
});

function canonicalArea(areaId, overrides = {}) {
  return {
    id: areaId,
    name: "Work",
    status: "active",
    sort_order: 0,
    created_via: "user_stated",
    source_proposal_id: null,
    created_at: "2026-09-18T00:00:00Z",
    updated_at: "2026-09-18T00:00:00Z",
    archived_at: null,
    currentState: null,
    desiredState: {
      summary: "Build a reliable outdoor business.",
      target_start_date: null,
      target_end_date: null,
      target_confidence: "aspirational",
      created_via: "user_stated",
      source_proposal_id: null,
      confirmed_at: "2026-09-18T00:00:00Z",
      created_at: "2026-09-18T00:00:00Z",
      updated_at: "2026-09-18T00:00:00Z",
    },
    goals: [],
    projects: [],
    routines: [],
    currentContexts: [],
    openQuestions: [],
    evidence: [],
    ...overrides,
  };
}
