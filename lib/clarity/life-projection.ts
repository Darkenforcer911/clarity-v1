import type { ClarityLedgerMemoryItem, ClarityMemoryContext } from "./ai/clarity-memory";
import type { LifeModel } from "./life-model";

const CURRENT_POSITION_LIMIT = 3;
const LEARNING_LIMIT = 3;
const MAX_VISIBLE_WORDS = 20;
const MAX_UNKNOWN_WORDS = 18;

export type LifeProjectionSection = {
  source: "canonical" | "derived" | "combined";
  items: string[];
  detail: string | null;
};

export type LifeProjectionLearningItem = {
  kind: "unknown" | "needs_review";
  text: string;
};

export type LifeProjection = {
  currentPosition: LifeProjectionSection | null;
  currentDirection: LifeProjectionSection | null;
  future: LifeProjectionSection | null;
  learning: LifeProjectionLearningItem[];
};

export type LifeProjectionProfile = {
  name: string | null;
  city: string | null;
  country: string | null;
};

export function buildLifeProjection(input: {
  profile: LifeProjectionProfile;
  life: LifeModel;
  memory: ClarityMemoryContext;
}): LifeProjection {
  let currentPosition = buildCurrentPosition(input);
  const currentReality = authoritativeCurrentReality(input.life, input.memory);
  const currentDirection = buildCurrentDirection(
    input.life,
    input.memory,
    input.profile,
    currentReality,
  );
  let future = buildFuture(input.life, input.memory, input.profile);
  if (currentDirection) {
    currentPosition = removeRepeatedItems(
      currentPosition,
      currentDirection.items,
    );
    future = removeRepeatedItems(future, currentDirection.items);
  }
  const visibleMeaning = [
    ...(currentPosition?.items ?? []),
    ...(currentDirection?.items ?? []),
    ...(future?.items ?? []),
  ];

  return {
    currentPosition,
    currentDirection,
    future,
    learning: buildLearning(
      input.life,
      input.memory,
      input.profile,
      currentReality,
      visibleMeaning,
    ),
  };
}

export function hasLifeProjectionContent(projection: LifeProjection) {
  return Boolean(
    projection.currentPosition ||
      projection.currentDirection ||
      projection.future ||
      projection.learning.length > 0,
  );
}

function buildCurrentPosition(input: {
  profile: LifeProjectionProfile;
  life: LifeModel;
  memory: ClarityMemoryContext;
}): LifeProjectionSection | null {
  const canonical = uniqueStatements(
    input.life.areas.flatMap((area) =>
      area.currentState
        ? [toSecondPerson(area.currentState.summary, input.profile.name)]
        : [],
    ),
  ).slice(0, CURRENT_POSITION_LIMIT);

  const currentFacts = input.memory.currentState.filter(
    (item) => item.truthState === "fact",
  );
  const durableFacts = input.memory.durableMemory.filter(
    (item) => item.truthState === "fact",
  );
  const currentReality =
    canonical.length === 0
      ? bestTopicItem(currentFacts, "current_reality")
      : null;
  const supportingCandidates = [
    summarizeConstraints(
      currentFacts.filter((item) => item.topic === "constraints"),
      input.profile.name,
    ),
    projectionCandidate(
      bestTopicItem(durableFacts, "behavioral_evidence"),
      30,
      input.profile.name,
    ),
    projectionCandidate(
      bestTopicItem(currentFacts, "capabilities_and_assets") ??
        bestTopicItem(durableFacts, "capabilities_and_assets"),
      20,
      input.profile.name,
    ),
  ]
    .filter(isProjectionCandidate)
    .sort((left, right) => right.score - left.score)
    .map((candidate) => candidate.text);
  const derived = uniqueStatements([
    ...(currentReality
      ? [toSecondPerson(currentReality.statement, input.profile.name)]
      : []),
    ...supportingCandidates,
  ]);
  const items = uniqueStatements([...canonical, ...derived]).slice(
    0,
    CURRENT_POSITION_LIMIT,
  );

  if (items.length === 0) {
    const location = profileLocation(input.profile);
    if (!location) return null;
    return { source: "canonical", items: [location], detail: null };
  }

  return {
    source:
      canonical.length > 0 && items.length > canonical.length
        ? "combined"
        : canonical.length > 0
          ? "canonical"
          : "derived",
    items,
    detail: null,
  };
}

function buildCurrentDirection(
  life: LifeModel,
  memory: ClarityMemoryContext,
  profile: LifeProjectionProfile,
  currentReality: string[],
): LifeProjectionSection | null {
  if (life.currentDirection) {
    return {
      source: "canonical",
      items: [toSecondPerson(life.currentDirection.summary, profile.name)],
      detail: null,
    };
  }

  const priorityFacts = memory.currentState
    .filter(
      (item) =>
        item.truthState === "fact" &&
        item.topic === "current_priority_or_pressure",
    )
    .sort(compareDirectionSignals);
  const routeFacts = memory.currentState.filter(
    (item) => item.truthState === "fact" && item.topic === "possible_routes",
  );
  const inferredRoutes = memory.currentState
    .filter(
      (item) =>
        item.truthState === "inference" &&
        (item.topic === "possible_route" || item.topic === "possible_routes"),
    );
  const selected = [
    ...priorityFacts,
    ...sortMemoryItems(routeFacts),
    ...sortMemoryItems(inferredRoutes),
  ].find(
    (item) =>
      resolveDerivedDirection(item, profile.name, currentReality) !== null,
  );
  const resolved = selected
    ? resolveDerivedDirection(selected, profile.name, currentReality)
    : null;
  const items = resolved ? [resolved] : [];

  return items.length > 0
    ? { source: "derived", items, detail: null }
    : null;
}

function buildFuture(
  life: LifeModel,
  memory: ClarityMemoryContext,
  profile: LifeProjectionProfile,
): LifeProjectionSection | null {
  const canonical = life.areas.flatMap((area) =>
    area.desiredState
      ? [toSecondPerson(area.desiredState.summary, profile.name)]
      : [],
  )[0];
  if (canonical) {
    return { source: "canonical", items: [canonical], detail: null };
  }

  const desiredFuture = [
    ...memory.durableMemory,
    ...memory.currentState,
  ]
    .filter(
      (item) => item.truthState === "fact" && item.topic === "desired_future",
    )
    .sort(compareFutureSignals);
  const items = desiredFuture[0]
    ? [toSecondPerson(desiredFuture[0].statement, profile.name)]
    : [];

  return items.length > 0
    ? { source: "derived", items, detail: null }
    : null;
}

function buildLearning(
  life: LifeModel,
  memory: ClarityMemoryContext,
  profile: LifeProjectionProfile,
  currentReality: string[],
  visibleMeaning: string[],
): LifeProjectionLearningItem[] {
  const canonicalQuestions = life.openQuestions.flatMap((question) => {
    const text = reconcileUnknown(
      question.question,
      profile.name,
      currentReality,
    );
    return text ? [{ kind: "unknown" as const, text }] : [];
  });
  const memoryUnknowns = sortMemoryItems(memory.materialUnknowns)
    .filter((item) => item.materiality !== "low")
    .flatMap((item) => {
      const text = reconcileUnknown(
        item.statement,
        profile.name,
        currentReality,
      );
      return text ? [{ kind: "unknown" as const, text }] : [];
    });
  const staleChecks = memory.staleCurrentState
    .filter((item) => item.materiality === "high")
    .sort(compareMemoryMateriality)
    .flatMap((item) =>
      hasSupersededEmploymentPremise(item.statement, currentReality)
        ? []
        : [
            {
              kind: "needs_review" as const,
              text: reviewAsQuestion(item.statement, profile.name),
            },
          ],
    );

  return uniqueLearningItems([
    ...canonicalQuestions,
    ...memoryUnknowns,
    ...staleChecks,
  ])
    .filter(
      (item) =>
        !visibleMeaning.some((visible) => sameMeaning(item.text, visible)),
    )
    .slice(0, LEARNING_LIMIT);
}

function authoritativeCurrentReality(
  life: LifeModel,
  memory: ClarityMemoryContext,
) {
  const canonical = life.areas.flatMap((area) =>
    area.currentState ? [area.currentState.summary] : [],
  );
  if (canonical.length > 0) return canonical;
  return memory.currentState
    .filter(
      (item) => item.truthState === "fact" && item.topic === "current_reality",
    )
    .map((item) => item.statement);
}

function resolveDerivedDirection(
  item: ClarityLedgerMemoryItem,
  profileName: string | null,
  currentReality: string[],
) {
  if (!hasSupersededEmploymentPremise(item.statement, currentReality)) {
    return item.truthState === "inference"
      ? qualifyInference(item.statement, profileName)
      : toSecondPerson(item.statement, profileName);
  }

  const route = extractTestingRoute(item.statement);
  const preservesStability =
    /\b(stable|steady|secure)\s+(?:income|employment|job|work)\b/i.test(
      item.statement,
    ) ||
    /\b(?:not ready to leave|keep(?:ing)? (?:the )?(?:job|role|income|employment|work))\b/i.test(
      item.statement,
    );
  if (!preservesStability || !route) return null;
  return `Keep stable employment while testing ${route}.`;
}

function reconcileUnknown(
  statement: string,
  profileName: string | null,
  currentReality: string[],
) {
  if (hasSupersededEmploymentPremise(statement, currentReality)) return null;
  return unknownAsQuestion(statement, profileName);
}

function unknownAsQuestion(statement: string, profileName: string | null) {
  const secondPerson = replacePersonalReferences(statement, profileName)
    .replace(/\s+/g, " ")
    .trim();
  if (secondPerson.endsWith("?")) {
    return shortenQuestion(secondPerson);
  }

  const whetherClause = secondPerson
    .replace(/^(?:it (?:is|remains) (?:unknown|unclear) whether)\s+/i, "")
    .replace(/^whether\s+/i, "")
    .replace(/\s+(?:is|remains) (?:unknown|unclear|uncertain)\.?$/i, "")
    .replace(/[.]$/, "")
    .trim();
  if (whetherClause !== secondPerson.replace(/[.]$/, "").trim()) {
    return shortenQuestion(questionFromClause(whetherClause));
  }

  const directUnknown = secondPerson.match(
    /^(.+?)\s+(?:is|remains)\s+(?:unknown|unclear|uncertain)\.?$/i,
  );
  if (directUnknown) {
    return shortenQuestion(`Is ${lowercaseFirst(directUnknown[1])} clear?`);
  }

  const untested = secondPerson.match(
    /^(.+?)\s+(?:remains?|is|are)\s+untested(?:\s+(.+?))?[.\u2026]*$/i,
  );
  if (untested) {
    const subject = untested[1];
    if (/\b(?:demand|customer acquisition)\b/i.test(subject)) {
      const domain = /\blandscap\w*\b/i.test(secondPerson)
        ? "landscaping "
        : "";
      return shortenQuestion(
        `Can you consistently win ${domain}customers beyond friends and referrals?`,
      );
    }
    return shortenQuestion(`Can you test ${lowercaseFirst(subject)}?`);
  }

  return shortenQuestion(
    questionFromClause(secondPerson.replace(/[.\u2026]+$/, "")),
  );
}

function reviewAsQuestion(statement: string, profileName: string | null) {
  const secondPerson = toSecondPerson(statement, profileName).replace(
    /[.\u2026]+$/,
    "",
  );
  const leadingYou = secondPerson.match(/^You\s+(.+)$/i);
  if (leadingYou) {
    const predicate = leadingYou[1]
      .replace(/^still\s+/i, "")
      .replace(/^work\s+/i, "work ");
    return shortenQuestion(`Do you still ${predicate}?`);
  }
  return shortenQuestion(`Is this still current: ${secondPerson}?`);
}

function questionFromClause(clause: string) {
  const modal = clause.match(
    /^(.+?)\s+(can|could|will|would|should|may|might)\s+(.+)$/i,
  );
  if (modal) {
    return `${capitalizeFirst(modal[2])} ${modal[1]} ${modal[3]}?`;
  }

  const be = clause.match(/^(.+?)\s+(is|are|was|were)\s+(.+)$/i);
  if (be) return `${capitalizeFirst(be[2])} ${be[1]} ${be[3]}?`;

  const simplePresent = clause.match(/^(.+?)\s+([a-z]+s)\s+(.+)$/i);
  if (simplePresent) {
    return `Does ${simplePresent[1]} ${singularVerbBase(simplePresent[2])} ${simplePresent[3]}?`;
  }

  return `${capitalizeFirst(clause)}?`;
}

function singularVerbBase(value: string) {
  if (/ies$/i.test(value)) return value.replace(/ies$/i, "y");
  if (/(ches|shes|sses|xes|zes)$/i.test(value)) {
    return value.replace(/es$/i, "");
  }
  return value.replace(/s$/i, "");
}

function shortenQuestion(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  const words = normalized.replace(/[?]$/, "").split(/\s+/);
  if (words.length <= MAX_UNKNOWN_WORDS) {
    return `${words.join(" ")}?`;
  }
  return `${words.slice(0, MAX_UNKNOWN_WORDS).join(" ")}?`;
}

function hasSupersededEmploymentPremise(
  statement: string,
  currentReality: string[],
) {
  const candidatePremises = employmentPremises(statement);
  if (candidatePremises.length === 0) return false;
  const currentPremises = currentReality.flatMap(employmentPremises);
  if (currentPremises.length === 0) return false;
  return candidatePremises.every((candidate) =>
    currentPremises.every(
      (current) => !roleTermsOverlap(candidate, current),
    ),
  );
}

function employmentPremises(statement: string) {
  const normalized = statement.replace(/\s+/g, " ").trim();
  const patterns = [
    /\b(?:started\s+working|working|works?|worked)\s+as\s+(?:an?\s+)?(.+?)(?=\s+(?:at|for|with|earning|but)\b|[,.]|$)/gi,
    /\b(?:is|was)\s+(?:an?\s+)(.+?)(?=\s+(?:at|for|with|earning)\b)/gi,
    /\b(?:leave|stay in|remain in|career in)\s+(.+?)(?=\s+(?:yet|while|and|because|for)\b|[,.]|$)/gi,
  ];
  return patterns.flatMap((pattern) =>
    [...normalized.matchAll(pattern)].map((match) => match[1].trim()),
  );
}

function roleTermsOverlap(left: string, right: string) {
  const leftTerms = roleTerms(left);
  const rightTerms = roleTerms(right);
  return [...leftTerms].some((term) => rightTerms.has(term));
}

function roleTerms(value: string) {
  const ignored = new Set([
    "a",
    "an",
    "and",
    "at",
    "company",
    "current",
    "job",
    "new",
    "role",
    "the",
  ]);
  return new Set(
    normalizeText(value)
      .split(" ")
      .map(normalizeRoleTerm)
      .filter((term) => term.length > 2 && !ignored.has(term)),
  );
}

function normalizeRoleTerm(value: string) {
  if (/^account(ant|ants|ing)$/.test(value)) return "account";
  if (/^admin(istration|istrator|istrators)?$/.test(value)) return "admin";
  if (/^manag(er|ers|ement)$/.test(value)) return "manage";
  return value.replace(/(ing|ers?|ists?)$/, "");
}

function extractTestingRoute(statement: string) {
  const match = statement.match(
    /\b(?:test(?:ing|s)?|explor(?:ing|es?)|build(?:ing|s)?|pursu(?:ing|es?))\s+(.+?)(?=\s+(?:on the side|part[- ]time|while|before|without|to see)\b|[,.]|$)/i,
  );
  if (!match) return null;
  return match[1]
    .replace(/^(?:whether|if)\s+/i, "")
    .replace(/^(?:he|she|they|you)\s+/i, "")
    .trim();
}

function replacePersonalReferences(
  statement: string,
  profileName: string | null,
) {
  let value = statement;
  const names = profileName
    ? [profileName, profileName.split(/\s+/)[0]].filter(Boolean)
    : [];
  for (const name of [...new Set(names)]) {
    const escaped = escapeRegExp(name);
    value = value
      .replace(new RegExp(`\\b${escaped}[’']s\\b`, "gi"), "your")
      .replace(new RegExp(`\\b${escaped}\\b`, "gi"), "you");
  }
  return value
    .replace(/\b(?:his|her|their)\b/gi, "your")
    .replace(/\b(?:he|she|they)\b/gi, "you")
    .replace(/\bdoes you\b/gi, "do you")
    .replace(/\bhas you\b/gi, "have you")
    .replace(/\bis you\b/gi, "are you")
    .replace(/\byou\s+is\b/gi, "you are")
    .replace(/\byou\s+has\b/gi, "you have")
    .replace(/\byou\s+works\b/gi, "you work")
    .replace(/\byou\s+wants\b/gi, "you want")
    .replace(/\byou\s+plans\b/gi, "you plan");
}

function capitalizeFirst(value: string) {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
}

function compareDirectionSignals(
  left: ClarityLedgerMemoryItem,
  right: ClarityLedgerMemoryItem,
) {
  return (
    materialityScore(right.materiality) - materialityScore(left.materiality) ||
    directionSignalScore(right.statement) -
      directionSignalScore(left.statement) ||
    compareMemoryRecency(left, right)
  );
}

function directionSignalScore(statement: string) {
  const value = statement.toLowerCase();
  return [
    /\b(intend|plan|want|aim|focus|priorit|keep|test)\w*\b/,
    /\b(would|will|not ready|until|before)\b/,
  ].reduce((score, pattern) => score + (pattern.test(value) ? 1 : 0), 0);
}

function compareFutureSignals(
  left: ClarityLedgerMemoryItem,
  right: ClarityLedgerMemoryItem,
) {
  return (
    materialityScore(right.materiality) - materialityScore(left.materiality) ||
    futureSignalScore(right.statement) - futureSignalScore(left.statement) ||
    compareMemoryRecency(left, right)
  );
}

function futureSignalScore(statement: string) {
  const value = statement.toLowerCase();
  return [
    /\b(eventually|long[- ]term|future)\b/,
    /\b(want|build|become|move toward|prefer)\w*\b/,
  ].reduce((score, pattern) => score + (pattern.test(value) ? 1 : 0), 0);
}

function profileLocation(profile: LifeProjectionProfile) {
  const location = [profile.city, profile.country]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(", ");
  return location ? `You’re based in ${location}.` : null;
}

type ProjectionCandidate = {
  text: string;
  score: number;
};

function projectionCandidate(
  item: ClarityLedgerMemoryItem | null | undefined,
  baseScore: number,
  profileName: string | null,
): ProjectionCandidate | null {
  if (!item || item.materiality === "low") return null;
  return {
    text: toSecondPerson(item.statement, profileName),
    score: baseScore + materialityScore(item.materiality) * 10,
  };
}

function isProjectionCandidate(
  candidate: ProjectionCandidate | null,
): candidate is ProjectionCandidate {
  return candidate !== null;
}

function bestTopicItem(items: ClarityLedgerMemoryItem[], topic: string) {
  return sortMemoryItems(items.filter((item) => item.topic === topic))[0] ?? null;
}

function sortMemoryItems(items: ClarityLedgerMemoryItem[]) {
  return [...items].sort(compareMemoryMateriality);
}

function compareMemoryMateriality(
  left: ClarityLedgerMemoryItem,
  right: ClarityLedgerMemoryItem,
) {
  return (
    materialityScore(right.materiality) - materialityScore(left.materiality) ||
    compareMemoryRecency(left, right)
  );
}

function compareMemoryRecency(
  left: ClarityLedgerMemoryItem,
  right: ClarityLedgerMemoryItem,
) {
  return (
    Date.parse(right.observedAt ?? right.confirmedAt) -
      Date.parse(left.observedAt ?? left.confirmedAt) ||
    left.id.localeCompare(right.id)
  );
}

function materialityScore(value: ClarityLedgerMemoryItem["materiality"]) {
  if (value === "high") return 3;
  if (value === "medium") return 2;
  return 1;
}

function summarizeConstraints(
  items: ClarityLedgerMemoryItem[],
  profileName: string | null,
): ProjectionCandidate | null {
  const consequential = sortMemoryItems(items).filter(
    (item) => item.materiality !== "low",
  );
  if (consequential.length === 0) return null;

  const combined = consequential
    .slice(0, 4)
    .map((item) => item.statement)
    .join(" ")
    .toLowerCase();
  const concepts = uniqueStatements([
    /\b(spouse|partner|family|child|children|dependant|dependent)\b/.test(combined)
      ? "family responsibilities"
      : "",
    /\bmortgage\b/.test(combined)
      ? "a mortgage"
      : /\b(rent|housing|home loan)\b/.test(combined)
        ? "housing costs"
        : "",
    /\b(debt|repayment|bills?|expenses?|financial obligations?|monthly obligations?)\b/.test(
      combined,
    )
      ? "financial obligations"
      : "",
    /\b(time pressure|limited time|long hours|working all the time|schedule)\b/.test(
      combined,
    )
      ? "time pressure"
      : "",
    /\b(health|medical|illness|disability|recovery)\b/.test(combined)
      ? "health constraints"
      : "",
    /\b(study|studies|university|school|coursework)\b/.test(combined)
      ? "study commitments"
      : "",
  ]).filter(Boolean);
  const text =
    concepts.length >= 2
      ? `You’re balancing ${naturalList(concepts.slice(0, 3))}.`
      : toSecondPerson(consequential[0].statement, profileName);

  return {
    text,
    score:
      40 +
      materialityScore(consequential[0].materiality) * 10 +
      Math.min(concepts.length, 3),
  };
}

function naturalList(values: string[]) {
  if (values.length <= 1) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function qualifyInference(statement: string, profileName: string | null) {
  const secondPerson = toSecondPerson(statement, profileName);
  return `Possibly, ${lowercaseFirst(secondPerson)}`;
}

function toSecondPerson(statement: string, profileName: string | null) {
  let value = replacePersonalReferences(statement, profileName)
    .replace(/\s+/g, " ")
    .trim();
  const subjects = [
    ...(profileName
      ? [profileName, profileName.split(/\s+/)[0]].filter(Boolean)
      : []),
    "the user",
    "user",
    "they",
  ];

  for (const subject of [...new Set(subjects)]) {
    const escaped = escapeRegExp(subject);
    const subjectRules: Array<[RegExp, string]> = [
      [new RegExp(`^${escaped}[’']s\\s+`, "i"), "Your "],
      [new RegExp(`^${escaped}\\s+is\\s+`, "i"), "You’re "],
      [new RegExp(`^${escaped}\\s+was\\s+`, "i"), "You were "],
      [new RegExp(`^${escaped}\\s+has\\s+`, "i"), "You have "],
      [new RegExp(`^${escaped}\\s+had\\s+`, "i"), "You had "],
      [new RegExp(`^${escaped}\\s+works\\s+`, "i"), "You work "],
      [new RegExp(`^${escaped}\\s+wants\\s+`, "i"), "You want "],
      [new RegExp(`^${escaped}\\s+plans\\s+`, "i"), "You plan "],
      [new RegExp(`^${escaped}\\s+prefers\\s+`, "i"), "You prefer "],
      [new RegExp(`^${escaped}\\s+owns\\s+`, "i"), "You own "],
      [new RegExp(`^${escaped}\\s+`, "i"), "You "],
    ];
    for (const [pattern, replacement] of subjectRules) {
      if (!pattern.test(value)) continue;
      value = value.replace(pattern, replacement);
      break;
    }
  }

  const leadingRules: Array<[RegExp, string]> = [
    [/^I am\s+/i, "You’re "],
    [/^I have\s+/i, "You have "],
    [/^I\s+/i, "You "],
    [/^Eventually wants\s+/i, "You eventually want "],
    [/^Currently works\s+/i, "You currently work "],
    [/^Still works\s+/i, "You still work "],
    [/^Works\s+/i, "You work "],
    [/^Has\s+/i, "You have "],
    [/^Is\s+/i, "You’re "],
    [/^Wants\s+/i, "You want "],
    [/^Plans\s+/i, "You plan "],
    [/^Prefers\s+/i, "You prefer "],
    [/^Owns\s+/i, "You own "],
    [/^Completed\s+/i, "You completed "],
    [/^Started\s+/i, "You started "],
    [/^Lives\s+/i, "You live "],
    [/^Studies\s+/i, "You study "],
  ];
  for (const [pattern, replacement] of leadingRules) {
    if (!pattern.test(value)) continue;
    value = value.replace(pattern, replacement);
    break;
  }

  value = value
    .replace(
      /\byou\s+(eventually|currently|still|now|also|usually|sometimes|generally)\s+(wants|plans|prefers|works)\b/gi,
      (_match, adverb: string, verb: string) =>
        `you ${adverb} ${verb.replace(/s$/i, "")}`,
    )
    .replace(/^you\b/, "You");

  return shortenProjectionText(value);
}

function shortenProjectionText(value: string) {
  const words = value.split(/\s+/);
  if (words.length <= MAX_VISIBLE_WORDS) return ensureSentence(value);

  const firstSentence = value.match(/^.+?[.!?](?:\s|$)/)?.[0]?.trim();
  if (firstSentence && firstSentence.split(/\s+/).length <= MAX_VISIBLE_WORDS) {
    return firstSentence;
  }
  return `${words.slice(0, MAX_VISIBLE_WORDS).join(" ").replace(/[.,;:]$/, "")}…`;
}

function ensureSentence(value: string) {
  return /[.!?…]$/.test(value) ? value : `${value}.`;
}

function lowercaseFirst(value: string) {
  return value ? `${value[0].toLowerCase()}${value.slice(1)}` : value;
}

function sameMeaning(left: string, right: string) {
  const leftTokens = meaningTokens(left);
  const rightTokens = meaningTokens(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) return false;
  const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return overlap / Math.min(leftTokens.size, rightTokens.size) >= 0.8;
}

function removeRepeatedItems(
  section: LifeProjectionSection | null,
  ownedElsewhere: string[],
) {
  if (!section) return null;
  const items = section.items.filter(
    (item) => !ownedElsewhere.some((owned) => sameMeaning(item, owned)),
  );
  return items.length > 0 ? { ...section, items } : null;
}

function meaningTokens(value: string) {
  const ignored = new Set([
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "for",
    "from",
    "in",
    "is",
    "it",
    "of",
    "on",
    "or",
    "the",
    "to",
    "you",
    "your",
    "youre",
  ]);
  return new Set(
    normalizeText(value)
      .split(" ")
      .map(normalizeMeaningTerm)
      .filter((token) => token.length > 2 && !ignored.has(token)),
  );
}

function normalizeMeaningTerm(value: string) {
  if (/ies$/.test(value)) return value.replace(/ies$/, "y");
  if (/ing$/.test(value) && value.length > 5) return value.replace(/ing$/, "");
  if (/s$/.test(value) && !/ss$/.test(value) && value.length > 3) {
    return value.replace(/s$/, "");
  }
  return value;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function uniqueStatements(values: string[]) {
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const trimmed = value.trim();
    const key = normalizeText(trimmed);
    if (!key || seen.has(key)) return [];
    seen.add(key);
    return [trimmed];
  });
}

function uniqueLearningItems(values: LifeProjectionLearningItem[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = normalizeText(value.text);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
