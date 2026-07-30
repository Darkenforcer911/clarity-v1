import type {
  PreviousDayInterpretation,
  PreviousDayInterpreter,
  PreviousDayOutcome,
} from "./previous-day-interpreter";

const guidancePattern =
  /^(?:idk|i don'?t know|not sure|what (?:do|should) i (?:do|work on)|help me choose)[.!?]*$/i;

const insignificantWords = new Set([
  "and",
  "for",
  "from",
  "into",
  "the",
  "this",
  "with",
  "work",
]);

export class MockPreviousDayInterpreter
  implements PreviousDayInterpreter
{
  async interpret(
    input: Parameters<PreviousDayInterpreter["interpret"]>[0],
  ): Promise<PreviousDayInterpretation> {
    const explanation = input.explanation.trim();

    if (guidancePattern.test(explanation)) {
      return {
        outcome: "needs_input",
        message:
          "Tell Clarity what changed yesterday. You can mention what was completed, what still matters, and what can be dropped.",
      };
    }

    const segments = explanation
      .split(/(?<=[.!?])\s+|\n+|,\s+|\s+and\s+/i)
      .map((segment) => segment.trim())
      .filter(Boolean);
    const matchedSegments = new Set<string>();
    const suggestions = input.actions.map((action) => {
      const segment = bestSegment(action.title, segments);

      if (segment) {
        matchedSegments.add(segment);
      }

      const outcome = segment
        ? outcomeFor(segment)
        : "needs_user_choice";
      const completedLocalTime =
        outcome === "completed_previous_day" && segment
          ? timeFrom(segment)
          : undefined;

      return {
        actionId: action.id,
        outcome,
        completedLocalTime,
      };
    });
    const unmatched = segments.filter(
      (segment) => !matchedSegments.has(segment),
    );
    const unplannedProgress = unmatched
      .filter(isUnplannedProgress)
      .map(normalizeProgress);
    const contextSegments = unmatched.filter(
      (segment) =>
        !isUnplannedProgress(segment) && isImportantContext(segment),
    );
    const unclassified = unmatched.filter(
      (segment) =>
        !isUnplannedProgress(segment) && !isImportantContext(segment),
    );
    const contextSummary =
      contextSegments.length > 0
        ? contextSegments.join(". ")
        : unclassified.length > 0 &&
            unplannedProgress.length === 0 &&
            matchedSegments.size === 0
          ? explanation
          : null;
    const ongoingContextCandidate = ongoingCandidate(explanation);

    return {
      outcome: "suggestions",
      suggestions,
      unplannedProgress,
      contextSummary,
      ongoingContextCandidate,
    };
  }
}

function bestSegment(title: string, segments: string[]) {
  const tokens = title
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(
      (token) =>
        token.length >= 3 &&
        !insignificantWords.has(token),
    );

  return segments.find((segment) => {
    const normalized = segment.toLowerCase();
    return tokens.some((token) => normalized.includes(token));
  });
}

function outcomeFor(segment: string): PreviousDayOutcome {
  if (
    /\b(?:doesn['’]?t matter|no longer matters?|not important|drop|skip|cancel)\b/i.test(
      segment,
    )
  ) {
    return "drop";
  }

  if (
    /\b(?:didn['’]?t|did not|couldn['’]?t|could not|never)\b/i.test(segment) &&
    /\b(?:finish|complete|do|work|start)\b/i.test(segment)
  ) {
    return "needs_user_choice";
  }

  if (
    /\b(?:finished|completed|done|did|sent|submitted|dropped .+ off)\b/i.test(
      segment,
    )
  ) {
    return "completed_previous_day";
  }

  if (/\b(?:today|carry|still matters?|still need)\b/i.test(segment)) {
    return "carry_to_today";
  }

  if (/\b(?:tomorrow|later|next week|future)\b/i.test(segment)) {
    return "choose_future_date";
  }

  return "needs_user_choice";
}

function timeFrom(segment: string) {
  const match = segment.match(
    /\b(?:at|around|about)\s+(\d{1,2})(?::([0-5]\d))?\s*(am|pm)\b/i,
  );

  if (!match) {
    return undefined;
  }

  let hour = Number(match[1]);
  const minute = Number(match[2] ?? "0");
  const meridiem = match[3].toLowerCase();

  if (hour < 1 || hour > 12) {
    return undefined;
  }

  if (meridiem === "pm" && hour !== 12) {
    hour += 12;
  } else if (meridiem === "am" && hour === 12) {
    hour = 0;
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function isUnplannedProgress(segment: string) {
  return /\b(?:finished|completed|submitted|sent|dropped .+ off|helped|attended)\b/i.test(
    segment,
  );
}

function isImportantContext(segment: string) {
  return /\b(?:priorities?|hospital|emergency|family|health|because|changed the day|unexpected)\b/i.test(
    segment,
  );
}

function normalizeProgress(segment: string) {
  const normalized = segment
    .replace(/^i\s+/i, "")
    .replace(/[.!?]+$/g, "")
    .trim();

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function ongoingCandidate(explanation: string) {
  if (
    /\b(?:university|uni|degree|coursework|assignment)\b/i.test(
      explanation,
    )
  ) {
    return {
      label: "University",
      sourceText: "university work",
    };
  }

  return null;
}
