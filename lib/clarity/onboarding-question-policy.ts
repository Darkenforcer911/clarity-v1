import {
  onboardingQuestionFocusDomains,
  type OnboardingQuestionFocus,
  type OnboardingQuestionFocusDomain,
} from "./onboarding-intelligence.ts";
import { rejectClarityStructuredOutput } from "./ai/clarity-structured-diagnostics.ts";
import {
  onboardingCanonicalStateForModel,
  type OnboardingCanonicalState,
  type OnboardingDiscoveryResponse,
} from "./onboarding-state-delta.ts";

type ConversationMessage = {
  role: "user" | "clarity";
  content: string;
};

export type OnboardingQuestionPolicy = {
  latestUserResponseWasNonAnswer: boolean;
  broadFutureAllowed: boolean;
  allowedDomains: OnboardingQuestionFocusDomain[];
  preferredTargets: Array<{
    domain: OnboardingQuestionFocusDomain;
    target: string;
    relatedUnknownId: string;
  }>;
  avoidRecentQuestions: string[];
  previousFocusDomain: OnboardingQuestionFocusDomain | null;
  mustPivotFromPreviousFocus: boolean;
};

const currentWorldPriority: OnboardingQuestionFocusDomain[] = [
  "CURRENT_WORK",
  "ECONOMIC_PRESSURE",
  "ACTIVE_PROJECTS",
  "OTHER_INCOME",
  "EDUCATION",
  "RESPONSIBILITIES",
  "CAPABILITIES",
  "CONSTRAINTS",
  "ACTIVE_DIRECTION",
  "OTHER",
];

export function seedUserIntroducedUnknowns(input: {
  state: OnboardingCanonicalState;
  latestUserMessage: string;
  previousFocus?: OnboardingQuestionFocus | null;
}): OnboardingCanonicalState {
  const additions: OnboardingCanonicalState["unknowns"] = [];
  if (
    isOnboardingNonAnswer(input.latestUserMessage) &&
    input.previousFocus &&
    !input.previousFocus.relatedUnknownId
  ) {
    additions.push({
      statement: `The user cannot currently answer the unresolved question about ${input.previousFocus.target}.`,
      materiality: "medium",
    });
  }
  if (additions.length === 0) return input.state;

  const existing = new Set(
    input.state.unknowns.map((unknown) => normalizeText(unknown.statement)),
  );
  const newUnknowns = additions.filter(
    (unknown) => !existing.has(normalizeText(unknown.statement)),
  );
  if (newUnknowns.length === 0) return input.state;

  return {
    ...input.state,
    unknowns: [...input.state.unknowns, ...newUnknowns].slice(0, 10),
  };
}

export function buildOnboardingQuestionPolicy(input: {
  state: OnboardingCanonicalState;
  messages: ConversationMessage[];
  previousFocus: OnboardingQuestionFocus | null;
}): OnboardingQuestionPolicy {
  const latestUser = [...input.messages]
    .reverse()
    .find((message) => message.role === "user");
  const latestUserResponseWasNonAnswer = isOnboardingNonAnswer(
    latestUser?.content ?? "",
  );
  const recentAssistantQuestions = input.messages
    .filter((message) => message.role === "clarity")
    .map((message) => extractMainQuestion(message.content))
    .filter((question): question is string => Boolean(question))
    .slice(-3);
  const inferredPreviousFocus =
    input.previousFocus ?? inferQuestionFocus(recentAssistantQuestions.at(-1));
  const identifiedUnknowns = onboardingCanonicalStateForModel(input.state).unknowns;
  const identifiedTargets = identifiedUnknowns
    .map((unknown) => ({
      domain: inferUnknownDomain(unknown.statement),
      target: unknown.statement,
      relatedUnknownId: unknown.unknownId,
      materiality: unknown.materiality,
    }))
    .sort((left, right) => {
      const materiality = Number(right.materiality === "high") - Number(left.materiality === "high");
      if (materiality !== 0) return materiality;
      return (
        currentWorldPriority.indexOf(left.domain) -
        currentWorldPriority.indexOf(right.domain)
      );
    })
    .map(({ domain, target, relatedUnknownId }) => ({
      domain,
      target,
      relatedUnknownId,
    }));
  const currentTargets = identifiedTargets.filter((target) =>
    currentWorldPriority.includes(target.domain),
  );
  const currentDomains = [...new Set(currentTargets.map((item) => item.domain))];
  const identifiedDomains = [
    ...new Set(identifiedTargets.map((item) => item.domain)),
  ];
  const hasCurrentWorldUncertainty =
    currentDomains.length > 0 || input.state.progress.situation !== "clear";
  const baseAllowedDomains = hasCurrentWorldUncertainty
    ? currentWorldPriority
    : identifiedDomains.length > 0
      ? identifiedDomains
      : [...onboardingQuestionFocusDomains];
  const pivotAlternatives = latestUserResponseWasNonAnswer
    ? baseAllowedDomains.filter(
        (domain) => domain !== inferredPreviousFocus?.domain,
      )
    : baseAllowedDomains;
  const mustPivotFromPreviousFocus =
    latestUserResponseWasNonAnswer &&
    inferredPreviousFocus !== null &&
    pivotAlternatives.length > 0;
  const allowedDomains = mustPivotFromPreviousFocus
    ? pivotAlternatives
    : baseAllowedDomains;

  return {
    latestUserResponseWasNonAnswer,
    broadFutureAllowed: !hasCurrentWorldUncertainty,
    allowedDomains,
    preferredTargets: identifiedTargets.filter((target) =>
      allowedDomains.includes(target.domain),
    ),
    avoidRecentQuestions: latestUserResponseWasNonAnswer
      ? recentAssistantQuestions
      : [],
    previousFocusDomain: inferredPreviousFocus?.domain ?? null,
    mustPivotFromPreviousFocus,
  };
}

export function validateOnboardingQuestionSelection(input: {
  discovery: OnboardingDiscoveryResponse;
  state: OnboardingCanonicalState;
  policy: OnboardingQuestionPolicy;
}) {
  if (input.discovery.readiness.readyToSynthesize) return;
  const focus = input.discovery.questionFocus;
  if (!focus) {
    rejectQuestionPolicy("missing_question_focus", null);
  }
  if (!input.policy.allowedDomains.includes(focus.domain)) {
    rejectQuestionPolicy("question_focus_not_allowed", focus.domain);
  }
  if (
    input.policy.mustPivotFromPreviousFocus &&
    focus.domain === input.policy.previousFocusDomain
  ) {
    rejectQuestionPolicy("non_answer_requires_focus_pivot", focus.domain);
  }

  const question = extractMainQuestion(input.discovery.assistantMessage);
  if (!question || !questionMatchesFocus(question, focus)) {
    rejectQuestionPolicy("visible_question_focus_mismatch", focus.domain);
  }
  if (!input.policy.broadFutureAllowed && isBroadFutureQuestion(question)) {
    rejectQuestionPolicy("broad_future_not_allowed", focus.domain);
  }
  if (
    input.policy.latestUserResponseWasNonAnswer &&
    input.policy.avoidRecentQuestions.some((prior) =>
      areQuestionsMateriallySame(prior, question),
    )
  ) {
    rejectQuestionPolicy("repeated_unanswered_question", focus.domain);
  }
  if (focus.relatedUnknownId) {
    if (
      input.discovery.stateDelta.unknownIdsToResolve.includes(
        focus.relatedUnknownId,
      )
    ) {
      rejectQuestionPolicy("question_targets_resolved_unknown", focus.domain, {
        canonicalId: focus.relatedUnknownId,
      });
    }
    const validUnknownIds = new Set(
      onboardingCanonicalStateForModel(input.state).unknowns.map(
        (unknown) => unknown.unknownId,
      ),
    );
    if (!validUnknownIds.has(focus.relatedUnknownId)) {
      rejectQuestionPolicy("unknown_question_focus_target", focus.domain, {
        canonicalId: focus.relatedUnknownId,
      });
    }
  }
}

function rejectQuestionPolicy(
  policyReason: string,
  questionFocusDomain: OnboardingQuestionFocusDomain | null,
  metadata: { canonicalId?: string } = {},
): never {
  const messages: Record<string, string> = {
    missing_question_focus:
      "A continuing onboarding turn requires a question focus.",
    question_focus_not_allowed:
      "The onboarding question focus is not currently allowed.",
    non_answer_requires_focus_pivot:
      "A non-answer requires a different question focus.",
    visible_question_focus_mismatch:
      "The visible onboarding question does not match its declared focus.",
    broad_future_not_allowed:
      "A broad future question is unavailable while current-world threads remain unresolved.",
    repeated_unanswered_question:
      "The onboarding question repeats an unanswered question.",
    question_targets_resolved_unknown:
      "The onboarding question cannot target a resolved unknown.",
    unknown_question_focus_target:
      "The onboarding question references an unknown focus target.",
  };
  return rejectClarityStructuredOutput("question_policy", policyReason, {
    policyReason,
    questionFocusDomain,
    ...(metadata.canonicalId ? { canonicalId: metadata.canonicalId } : {}),
  }, messages[policyReason]);
}

export function isOnboardingNonAnswer(value: string) {
  const normalized = normalizeText(value)
    .replace(/[.!?,]/g, "")
    .replace(/\b(?:honestly|really|just|uh|um)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return /^(?:idk|i do not know|i dont know|dont know|not sure|im not sure|no idea|i have no idea|havent thought about it|i havent thought about it|never thought about it)$/.test(
    normalized,
  );
}

export function areQuestionsMateriallySame(left: string, right: string) {
  const leftNormalized = normalizeText(left);
  const rightNormalized = normalizeText(right);
  if (leftNormalized === rightNormalized) return true;

  const leftTokens = questionTokens(left);
  const rightTokens = questionTokens(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) return false;
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token));
  const union = new Set([...leftTokens, ...rightTokens]);
  return (
    intersection.length / union.size >= 0.6 ||
    intersection.length / Math.min(leftTokens.size, rightTokens.size) >= 0.8
  );
}

function inferUnknownDomain(
  statement: string,
): OnboardingQuestionFocusDomain {
  const text = normalizeText(statement);
  if (/\b(?:side income|side-income|side hustle|other income)\b/.test(text)) {
    return "OTHER_INCOME";
  }
  if (/\b(?:projects?|business|startup|commitments?)\b/.test(text)) {
    return "ACTIVE_PROJECTS";
  }
  if (/\b(?:income|money|financial|runway|savings|afford|economic)\b/.test(text)) {
    return "ECONOMIC_PRESSURE";
  }
  if (/\b(?:job|work|employment|career)\b/.test(text)) return "CURRENT_WORK";
  if (/\b(?:study|education|university|school|course|degree)\b/.test(text)) {
    return "EDUCATION";
  }
  if (/\b(?:responsibilit|children|childcare|caring|dependant|dependent)\w*\b/.test(text)) {
    return "RESPONSIBILITIES";
  }
  if (/\b(?:skill|capabilit|experience|asset|evidence)\w*\b/.test(text)) {
    return "CAPABILITIES";
  }
  if (/\b(?:constraint|limit|health|time available)\w*\b/.test(text)) {
    return "CONSTRAINTS";
  }
  if (/\b(?:option|direction|considering|choice|choosing)\w*\b/.test(text)) {
    return "ACTIVE_DIRECTION";
  }
  if (/\b(?:future|year from now|long term|life look like|want)\b/.test(text)) {
    return "FUTURE_PULL";
  }
  return "OTHER";
}

function inferQuestionFocus(question: string | undefined): OnboardingQuestionFocus | null {
  if (!question) return null;
  const domain = inferUnknownDomain(question);
  return {
    domain,
    target: question.replace(/\?+$/, "").trim(),
    reason: "Inferred from the prior visible question.",
    relatedUnknownId: null,
  };
}

function questionMatchesFocus(
  question: string,
  focus: OnboardingQuestionFocus,
) {
  const questionSet = questionTokens(question);
  const targetSet = questionTokens(focus.target);
  if ([...questionSet].some((token) => targetSet.has(token))) return true;
  return domainKeywords(focus.domain).some((token) => questionSet.has(token));
}

function domainKeywords(domain: OnboardingQuestionFocusDomain) {
  const keywords: Record<OnboardingQuestionFocusDomain, string[]> = {
    CURRENT_WORK: ["job", "role", "work", "employment", "career"],
    ECONOMIC_PRESSURE: ["income", "money", "financial", "runway", "savings", "urgent"],
    ACTIVE_PROJECTS: ["project", "business", "building", "commitment", "thing"],
    OTHER_INCOME: ["side", "income", "paid", "earn", "customer"],
    EDUCATION: ["study", "education", "university", "school", "course", "degree"],
    RESPONSIBILITIES: ["responsibility", "family", "child", "caring", "dependent"],
    CAPABILITIES: ["skill", "capability", "experience", "built", "done", "evidence"],
    CONSTRAINTS: ["constraint", "limit", "time", "health", "available"],
    ACTIVE_DIRECTION: ["direction", "option", "choice", "considering", "next"],
    FUTURE_PULL: ["future", "year", "want", "life", "change"],
    POSSIBILITY_EXPANSION: ["possibility", "route", "could", "option"],
    OTHER: [],
  };
  return keywords[domain];
}

function extractMainQuestion(value: string) {
  const matches = value.match(/[^.!?\n]*\?/g);
  return matches?.at(-1)?.trim() ?? null;
}

function isBroadFutureQuestion(value: string) {
  const text = normalizeText(value);
  return /\b(?:future|dream life|ideal life|year from now|years from now|long term|life to look like)\b/.test(
    text,
  );
}

function questionTokens(value: string) {
  const stop = new Set([
    "a", "about", "and", "are", "be", "do", "for", "from", "have", "how",
    "i", "in", "is", "it", "most", "of", "or", "the", "this", "to", "what",
    "would", "you", "your",
  ]);
  const aliases: Record<string, string> = {
    like: "desire",
    want: "desire",
    wish: "desire",
    hope: "desire",
    different: "change",
    improve: "change",
    changed: "change",
    changing: "change",
    years: "year",
    yearly: "year",
    job: "work",
    role: "work",
    employment: "work",
    financially: "financial",
  };
  return new Set(
    normalizeText(value)
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter(Boolean)
      .map((token) => aliases[token] ?? token)
      .filter((token) => !stop.has(token)),
  );
}

function normalizeText(value: string) {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/[’']/g, "")
    .replace(/\s+/g, " ");
}
