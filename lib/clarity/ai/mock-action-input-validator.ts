import type {
  ActionInputValidationInput,
  ActionInputValidationResult,
  ActionInputValidator,
} from "./action-input-validator";

const userUnsurePattern =
  /^(?:idk|i\s+(?:do\s*not|don['’]?t)\s+know|don['’]?t\s+know|not\s+sure|unsure|no\s+idea|what\s+(?:do|should)\s+i\s+(?:do|work\s+on)(?:\s+today)?|help\s+me\s+(?:choose|decide)|anything|something)$/i;

const invalidPattern =
  /^(?:asdf\w*|qwerty\w*|zxcv\w*|sdfgh\w*|hjkl\w*|blah(?:\s+blah)*|foo\s+bar|lorem\s+ipsum)$/i;

const vaguePhrasePattern =
  /^(?:do|do\s+it|do\s+that|sort\s+it|sort\s+that|work|work\s+on\s+it|stuff|things?|project|task|admin|something\s+productive|finish\s+it|fix\s+it|deal\s+with\s+it)$/i;

const vagueReferentPattern = /\b(?:it|that|this|stuff|things?)\b/i;

const validSingleWordActions = new Set([
  "clean",
  "cook",
  "exercise",
  "groceries",
  "gym",
  "journal",
  "laundry",
  "meditate",
  "meditation",
  "read",
  "run",
  "shower",
  "stretch",
  "study",
  "walk",
  "workout",
]);

const actionVerbs = new Set([
  "apply",
  "book",
  "build",
  "buy",
  "call",
  "cancel",
  "check",
  "choose",
  "clean",
  "collect",
  "complete",
  "cook",
  "create",
  "draft",
  "email",
  "finish",
  "fix",
  "follow",
  "go",
  "make",
  "order",
  "organise",
  "organize",
  "pay",
  "plan",
  "pick",
  "prepare",
  "read",
  "research",
  "review",
  "schedule",
  "send",
  "submit",
  "update",
  "visit",
  "wash",
  "write",
]);

const incompleteVerbs = new Set([
  "apply",
  "book",
  "build",
  "buy",
  "call",
  "cancel",
  "check",
  "choose",
  "collect",
  "complete",
  "create",
  "draft",
  "email",
  "finish",
  "fix",
  "go",
  "make",
  "order",
  "organise",
  "organize",
  "pay",
  "plan",
  "pick",
  "prepare",
  "research",
  "review",
  "schedule",
  "send",
  "submit",
  "update",
  "visit",
  "write",
]);

const UNSURE_MESSAGE =
  "It sounds like you’re unsure what to work on. Clarity can help choose the next useful action.";

const INVALID_MESSAGE =
  "I couldn’t understand that as an action. Describe what you want to get done in plain language.";

export class MockActionInputValidator implements ActionInputValidator {
  async validate(
    input: ActionInputValidationInput,
  ): Promise<ActionInputValidationResult> {
    if (input.helpRequested) {
      return {
        classification: "ambiguous",
        clarification: input.planFocus
          ? `What small result would move “${truncate(input.planFocus, 160)}” forward today?`
          : "What would make today feel usefully complete?",
        exhausted: false,
      };
    }

    const originalTitle = normalizeWhitespace(input.title);
    const clarificationAnswer = normalizeWhitespace(
      input.clarificationAnswer ?? "",
    );
    const clarificationAttempted = Boolean(input.clarificationQuestion);
    const hasClarification =
      clarificationAttempted && Boolean(clarificationAnswer);

    if (clarificationAttempted && !clarificationAnswer) {
      return {
        classification: "ambiguous",
        clarification: null,
        exhausted: true,
      };
    }

    if (
      !hasClarification &&
      userUnsurePattern.test(cleanForMatching(originalTitle))
    ) {
      return {
        classification: "user_unsure",
        message: UNSURE_MESSAGE,
      };
    }

    const candidate = hasClarification
      ? combineOriginalAndAnswer(originalTitle, clarificationAnswer)
      : originalTitle;

    if (
      hasClarification &&
      (isInvalid(clarificationAnswer) ||
        userUnsurePattern.test(cleanForMatching(clarificationAnswer)) ||
        isAmbiguous(candidate))
    ) {
      return {
        classification: "ambiguous",
        clarification: null,
        exhausted: true,
      };
    }

    if (isInvalid(candidate)) {
      return {
        classification: "invalid",
        message: INVALID_MESSAGE,
      };
    }

    if (isAmbiguous(candidate)) {
      return {
        classification: "ambiguous",
        clarification: clarificationQuestion(candidate, input.planFocus),
        exhausted: false,
      };
    }

    return {
      classification: "actionable",
      normalizedTitle: normalizeTitle(candidate),
    };
  }
}

function combineOriginalAndAnswer(title: string, clarification: string) {
  if (userUnsurePattern.test(cleanForMatching(title))) {
    return clarification;
  }

  const firstWord = cleanForMatching(title).split(" ")[0] ?? "";

  if (incompleteVerbs.has(firstWord) && !startsWithActionVerb(clarification)) {
    return `${title} ${clarification}`;
  }

  if (/\b(?:it|this|that)\b/i.test(clarification)) {
    return clarification.replace(/\b(?:it|this|that)\b/i, title);
  }

  return `${title}: ${clarification}`;
}

function isInvalid(value: string) {
  const matchingValue = cleanForMatching(value);
  const lettersAndNumbers = value.match(/[\p{L}\p{N}]/gu) ?? [];
  const letters = value.match(/\p{L}/gu) ?? [];

  if (
    !matchingValue ||
    lettersAndNumbers.length < 2 ||
    invalidPattern.test(matchingValue) ||
    /^([\p{L}\p{N}])\1{2,}$/iu.test(matchingValue.replace(/\s/g, ""))
  ) {
    return true;
  }

  const visibleCharacters = value.replace(/\s/g, "").length;
  const symbolCount = Math.max(0, visibleCharacters - lettersAndNumbers.length);

  if (visibleCharacters > 0 && symbolCount / visibleCharacters > 0.5) {
    return true;
  }

  const words = matchingValue.split(" ");

  return words.some(
    (word) =>
      word.length >= 5 &&
      !/[aeiouy]/i.test(word) &&
      !/^(?:html|css|sql|pdf|cv)$/i.test(word),
  ) && letters.length >= 5;
}

function isAmbiguous(value: string) {
  const matchingValue = cleanForMatching(value);
  const words = matchingValue.split(" ").filter(Boolean);

  if (
    vaguePhrasePattern.test(matchingValue) ||
    (vagueReferentPattern.test(matchingValue) &&
      !/\b(?:email|message|send|call)\b/i.test(matchingValue))
  ) {
    return true;
  }

  if (words.length === 1) {
    return !validSingleWordActions.has(words[0]);
  }

  return !startsWithActionVerb(matchingValue) && words.length < 3;
}

function startsWithActionVerb(value: string) {
  const [firstWord] = cleanForMatching(value).split(" ");
  return actionVerbs.has(firstWord);
}

function clarificationQuestion(value: string, planFocus: string | null) {
  const matchingValue = cleanForMatching(value);

  if (vagueReferentPattern.test(matchingValue)) {
    return "What exactly should be finished or changed?";
  }

  if (/^(?:call|email|message|send)$/.test(matchingValue)) {
    return `Who do you need to ${matchingValue}, and what should happen next?`;
  }

  if (planFocus) {
    return `What specific result should “${value}” produce for “${truncate(planFocus, 160)}”?`;
  }

  return `What specific result should “${value}” produce?`;
}

function normalizeTitle(value: string) {
  const withoutPrefix = value
    .replace(/^(?:i\s+need\s+to|need\s+to|to[- ]?do:?)\s+/i, "")
    .replace(/[.!?]+$/g, "")
    .trim();
  const title =
    withoutPrefix.charAt(0).toUpperCase() + withoutPrefix.slice(1);

  return truncate(title, 200);
}

function normalizeWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function cleanForMatching(value: string) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}'’\s-]/gu, "")
    .trim();
}

function truncate(value: string, maximum: number) {
  return value.length <= maximum
    ? value
    : `${value.slice(0, maximum - 1).trimEnd()}…`;
}
