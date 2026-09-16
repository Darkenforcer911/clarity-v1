import {
  onboardingQuestionFocusDomains,
  type OnboardingQuestionFocus,
  type OnboardingQuestionFocusDomain,
} from "./onboarding-intelligence.ts";
import {
  onboardingCanonicalStateForModel,
  type OnboardingCanonicalState,
  type OnboardingDiscoveryResponse,
} from "./onboarding-state-delta.ts";

type ConversationMessage = {
  role: "user" | "clarity";
  content: string;
};

type IntroducedThread = {
  domain: OnboardingQuestionFocusDomain;
  statement: string;
  target: string;
  materiality: "medium" | "high";
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
];

export function seedUserIntroducedUnknowns(input: {
  state: OnboardingCanonicalState;
  latestUserMessage: string;
  previousFocus?: OnboardingQuestionFocus | null;
}): OnboardingCanonicalState {
  const threads = deriveUserIntroducedThreads(input.latestUserMessage);
  if (
    isOnboardingNonAnswer(input.latestUserMessage) &&
    input.previousFocus &&
    !input.previousFocus.relatedUnknownId
  ) {
    threads.push({
      domain: input.previousFocus.domain,
      statement: `The user cannot currently answer the unresolved question about ${input.previousFocus.target}.`,
      target: input.previousFocus.target,
      materiality: "medium",
    });
  }
  if (threads.length === 0) return input.state;

  const existing = new Set(
    input.state.unknowns.map((unknown) => normalizeText(unknown.statement)),
  );
  const additions = threads
    .filter((thread) => !existing.has(normalizeText(thread.statement)))
    .map(({ statement, materiality }) => ({ statement, materiality }));
  if (additions.length === 0) return input.state;

  return {
    ...input.state,
    unknowns: [...input.state.unknowns, ...additions].slice(0, 10),
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
  const preferredTargets = identifiedUnknowns
    .map((unknown) => ({
      domain: inferUnknownDomain(unknown.statement),
      target: unknown.statement,
      relatedUnknownId: unknown.unknownId,
      materiality: unknown.materiality,
    }))
    .filter(
      (target): target is typeof target & {
        domain: OnboardingQuestionFocusDomain;
      } => target.domain !== null && currentWorldPriority.includes(target.domain),
    )
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
  const currentDomains = [...new Set(preferredTargets.map((item) => item.domain))];
  const pivotAlternatives = latestUserResponseWasNonAnswer
    ? currentDomains.filter((domain) => domain !== inferredPreviousFocus?.domain)
    : currentDomains;
  const mustPivotFromPreviousFocus =
    latestUserResponseWasNonAnswer && pivotAlternatives.length > 0;
  const allowedDomains =
    currentDomains.length > 0
      ? mustPivotFromPreviousFocus
        ? pivotAlternatives
        : currentDomains
      : [...onboardingQuestionFocusDomains];

  return {
    latestUserResponseWasNonAnswer,
    broadFutureAllowed: currentDomains.length === 0,
    allowedDomains,
    preferredTargets: preferredTargets.filter((target) =>
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
  if (!focus) throw new Error("A continuing onboarding turn requires a question focus.");
  if (!input.policy.allowedDomains.includes(focus.domain)) {
    throw new Error("The onboarding question focus is not currently allowed.");
  }
  if (
    input.policy.mustPivotFromPreviousFocus &&
    focus.domain === input.policy.previousFocusDomain
  ) {
    throw new Error("A non-answer requires a different question focus.");
  }

  const question = extractMainQuestion(input.discovery.assistantMessage);
  if (!question || !questionMatchesFocus(question, focus)) {
    throw new Error("The visible onboarding question does not match its declared focus.");
  }
  if (!input.policy.broadFutureAllowed && isBroadFutureQuestion(question)) {
    throw new Error(
      "A broad future question is unavailable while current-world threads remain unresolved.",
    );
  }
  if (
    input.policy.latestUserResponseWasNonAnswer &&
    input.policy.avoidRecentQuestions.some((prior) =>
      areQuestionsMateriallySame(prior, question),
    )
  ) {
    throw new Error("The onboarding question repeats an unanswered question.");
  }
  if (focus.relatedUnknownId) {
    if (
      input.discovery.stateDelta.unknownIdsToResolve.includes(
        focus.relatedUnknownId,
      )
    ) {
      throw new Error("The onboarding question cannot target a resolved unknown.");
    }
    const validUnknownIds = new Set(
      onboardingCanonicalStateForModel(input.state).unknowns.map(
        (unknown) => unknown.unknownId,
      ),
    );
    if (!validUnknownIds.has(focus.relatedUnknownId)) {
      throw new Error("The onboarding question references an unknown focus target.");
    }
  }
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

function deriveUserIntroducedThreads(value: string): IntroducedThread[] {
  const text = normalizeText(value);
  const threads: IntroducedThread[] = [];
  if (
    /\b(?:lost|lose|left|fired|laid off|redundan\w*)\b.{0,28}\b(?:job|role|work|employment)\b/.test(
      text,
    ) ||
    /\b(?:job|role|work|employment)\b.{0,28}\b(?:lost|lose|left|fired|laid off|redundan\w*)\b/.test(
      text,
    )
  ) {
    threads.push({
      domain: "CURRENT_WORK",
      statement:
        "The user's previous role, relevant work experience, and current employment situation remain unresolved.",
      target: "the user's previous work and current employment situation",
      materiality: "high",
    });
    threads.push({
      domain: "ECONOMIC_PRESSURE",
      statement:
        "Whether replacement income is needed, and how urgently, remains unresolved.",
      target: "the urgency of replacement income",
      materiality: "high",
    });
  }
  if (
    /\b(?:a few|several|other|lots? of)\s+(?:other\s+)?(?:things|stuff)\b/.test(text) ||
    /\b(?:things|stuff)\s+(?:going on|happening)\b/.test(text)
  ) {
    threads.push({
      domain: "ACTIVE_PROJECTS",
      statement:
        "The other projects, commitments, income sources, or study the user introduced remain unresolved.",
      target: "the other things the user currently has going on",
      materiality: "high",
    });
  }
  if (/\b(?:side income|side hustle|money on the side|earn on the side)\b/.test(text)) {
    threads.push({
      domain: "OTHER_INCOME",
      statement: "The side-income activity and how material it is remain unresolved.",
      target: "the user's side-income activity and evidence",
      materiality: "high",
    });
  }
  if (/\b(?:building|project|business|startup|company)\b/.test(text)) {
    threads.push({
      domain: "ACTIVE_PROJECTS",
      statement: "The active project or business the user introduced remains unresolved.",
      target: "the active project or business",
      materiality: "medium",
    });
  }
  return deduplicateThreads(threads);
}

function inferUnknownDomain(
  statement: string,
): OnboardingQuestionFocusDomain | null {
  const text = normalizeText(statement);
  if (/\b(?:side income|side-income|side hustle|other income)\b/.test(text)) {
    return "OTHER_INCOME";
  }
  if (/\b(?:projects?|business|startup|commitments?|things going on)\b/.test(text)) {
    return "ACTIVE_PROJECTS";
  }
  if (/\b(?:income|money|financial|runway|savings|afford|economic)\b/.test(text)) {
    return "ECONOMIC_PRESSURE";
  }
  if (/\b(?:job|role|work|employment|career)\b/.test(text)) return "CURRENT_WORK";
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
  return null;
}

function inferQuestionFocus(question: string | undefined): OnboardingQuestionFocus | null {
  if (!question) return null;
  const domain = inferUnknownDomain(question);
  return domain
    ? {
        domain,
        target: question.replace(/\?+$/, "").trim(),
        reason: "Inferred from the prior visible question.",
        relatedUnknownId: null,
      }
    : null;
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

function deduplicateThreads(threads: IntroducedThread[]) {
  const seen = new Set<string>();
  return threads.filter((thread) => {
    const key = `${thread.domain}:${normalizeText(thread.statement)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeText(value: string) {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/[’']/g, "")
    .replace(/\s+/g, " ");
}
