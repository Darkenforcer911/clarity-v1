import { addLocalDays, formatWeekday } from "../date-time";
import type {
  ReturnRecapGapDateRange,
  ReturnRecapGapUpdate,
  ReturnRecapInterpretation,
  ReturnRecapInterpreter,
  ReturnRecapPlanAction,
  ReturnRecapPlanProposal,
} from "./return-recap-interpreter";

const ignoredTitleWords = new Set([
  "and",
  "for",
  "make",
  "my",
  "the",
  "to",
]);

export class MockReturnRecapInterpreter
  implements ReturnRecapInterpreter
{
  async interpretReturnRecap(
    input: string,
    previousPlan: ReturnRecapPlanAction[],
    gapDateRange: ReturnRecapGapDateRange,
  ): Promise<ReturnRecapInterpretation> {
    const segments = splitSegments(input);
    const matchedSegments = new Set<string>();
    const plannedActions = previousPlan.map((action) => {
      const segment = bestActionSegment(action.title, segments);

      if (!segment) {
        return unchangedProposal(action);
      }

      matchedSegments.add(segment);
      return planProposal(action, segment);
    });
    const unmatchedSegments = segments.filter(
      (segment) => !matchedSegments.has(segment),
    );
    const clarifications = unmatchedSegments
      .filter(isAmbiguousReference)
      .map((phrase, index) => ({
        id: `clarification-${index + 1}`,
        phrase,
        question: `“${phrase}” — Which task did you mean?`,
        suggestedActionIds: previousPlan
          .filter((action) => action.existingOutcome !== "finished")
          .map((action) => action.id),
      }));
    const clarificationPhrases = new Set(
      clarifications.map((item) => item.phrase),
    );
    const gapUpdates = unmatchedSegments
      .filter((segment) => !clarificationPhrases.has(segment))
      .map((segment, index) =>
        gapUpdateFor(segment, index, gapDateRange),
      )
      .filter(
        (update): update is ReturnRecapGapUpdate => update !== null,
      );

    return {
      plannedActions,
      gapUpdates,
      clarifications,
    };
  }
}

function unchangedProposal(
  action: ReturnRecapPlanAction,
): ReturnRecapPlanProposal {
  if (action.existingOutcome === "finished") {
    return {
      actionId: action.id,
      outcome: "finished",
      confidence: "high",
    };
  }

  return {
    actionId: action.id,
    outcome: "needs_review",
    confidence: "low",
  };
}

function planProposal(
  action: ReturnRecapPlanAction,
  segment: string,
): ReturnRecapPlanProposal {
  const supportingPhrase = cleanPhrase(segment);

  if (
    /\b(?:instead|someone else|cancelled|canceled|plans? changed|no longer needed|didn['’]?t need)\b/i.test(
      segment,
    )
  ) {
    return {
      actionId: action.id,
      outcome: "resolved_elsewhere",
      resolutionDetail: supportingPhrase,
      confidence: "high",
      supportingPhrase,
    };
  }

  if (
    /\b(?:didn['’]?t|did not|couldn['’]?t|could not|never)\b/i.test(
      segment,
    )
  ) {
    return {
      actionId: action.id,
      outcome: "not_done",
      confidence: "high",
      supportingPhrase,
    };
  }

  if (
    /\b(?:worked on|started|part.?way|some progress|for a while)\b/i.test(
      segment,
    )
  ) {
    return {
      actionId: action.id,
      outcome: "made_progress",
      progressDetail: supportingPhrase,
      confidence: "high",
      supportingPhrase,
    };
  }

  return {
    actionId: action.id,
    outcome: "finished",
    completionTime: timeFrom(segment),
    confidence: "high",
    supportingPhrase,
  };
}

function gapUpdateFor(
  segment: string,
  index: number,
  range: ReturnRecapGapDateRange,
): ReturnRecapGapUpdate | null {
  const approximateDate = mentionedDate(segment, range);
  const supportingPhrase = cleanPhrase(segment);
  const exactTime = timeFrom(segment) ?? null;

  if (
    /\b(?:due|deadline|appointment|meeting|scheduled)\b/i.test(segment)
  ) {
    return {
      id: `gap-update-${index + 1}`,
      kind: "commitment_or_deadline",
      title: commitmentTitle(segment),
      description: supportingPhrase,
      approximateDate,
      exactTime,
      outcome: null,
      stillAffectsToday: true,
      dueDate: dueDateFrom(segment, range.currentDate),
      confidence: "high",
      supportingPhrase,
    };
  }

  if (
    /\b(?:blocked|changed|rested|sick|unwell|unexpected|couldn['’]?t|breakup|broke up|barely slept|poor sleep|no sleep)\b/i.test(
      segment,
    )
  ) {
    return {
      id: `gap-update-${index + 1}`,
      kind: "change_or_blocker",
      title: /\brested\b/i.test(segment)
        ? "Rested; no ongoing update"
        : supportingPhrase,
      description: supportingPhrase,
      approximateDate,
      exactTime,
      outcome: null,
      stillAffectsToday: !/\b(?:rested|nothing important)\b/i.test(
        segment,
      ),
      dueDate: null,
      confidence: "high",
      supportingPhrase,
    };
  }

  if (
    /\b(?:applied|closed|finished|completed|submitted|worked|went|did|made|walked)\b/i.test(
      segment,
    )
  ) {
    return {
      id: `gap-update-${index + 1}`,
      kind: "work_or_progress",
      title: historicalWorkTitle(segment),
      description: supportingPhrase,
      approximateDate,
      exactTime,
      outcome: /\b(?:worked|started|progress)\b/i.test(segment)
        ? "made_progress"
        : "finished",
      stillAffectsToday: false,
      dueDate: null,
      confidence: "medium",
      supportingPhrase,
    };
  }

  return null;
}

function splitSegments(input: string) {
  return input
    .split(/(?<=[.!?])\s+|\n+/)
    .flatMap((segment) =>
      segment.split(
        /(?=\b(?:Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Monday)\b)/i,
      ),
    )
    .flatMap((segment) =>
      segment.split(/\s+(?:and|but)\s+|,\s*(?:but\s+)?/i),
    )
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function bestActionSegment(title: string, segments: string[]) {
  const normalizedTitle = title.toLowerCase();
  const aliases = [
    ...normalizedTitle
      .split(/[^a-z0-9]+/)
      .filter(
        (token) =>
          token.length >= 3 && !ignoredTitleWords.has(token),
      ),
    ...(normalizedTitle.includes("resume") ? ["cv"] : []),
    ...(normalizedTitle.includes("dinner")
      ? ["cook", "food", "meal"]
      : []),
    ...(normalizedTitle.includes("gym") ? ["workout"] : []),
  ];

  return segments.find((segment) => {
    const normalizedSegment = segment.toLowerCase();
    return aliases.some((alias) => normalizedSegment.includes(alias));
  });
}

function isAmbiguousReference(segment: string) {
  return /\b(?:worked on|did|finished|started)\s+(?:it|that|this)\b/i.test(
    segment,
  );
}

function mentionedDate(
  segment: string,
  range: ReturnRecapGapDateRange,
) {
  return (
    range.dates.find((date) =>
      new RegExp(`\\b${formatWeekday(date)}\\b`, "i").test(segment),
    ) ?? null
  );
}

function dueDateFrom(segment: string, currentDate: string) {
  const weekdays = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const targetIndex = weekdays.findIndex((weekday) =>
    new RegExp(`\\b${weekday}\\b`, "i").test(segment),
  );

  if (targetIndex < 0) {
    return null;
  }

  let candidate = currentDate;

  for (let offset = 0; offset < 7; offset += 1) {
    candidate = addLocalDays(candidate, offset === 0 ? 0 : 1);
    const dayIndex = new Date(`${candidate}T12:00:00Z`).getUTCDay();

    if (dayIndex === targetIndex) {
      return candidate;
    }
  }

  return null;
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

function cleanPhrase(segment: string) {
  return segment.replace(/[.!?]+$/g, "").trim();
}

function historicalWorkTitle(segment: string) {
  const phrase = cleanPhrase(segment)
    .replace(
      /^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+/i,
      "",
    )
    .replace(/^I\s+/i, "");

  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

function commitmentTitle(segment: string) {
  if (/\bassignment\b/i.test(segment)) {
    return "Assignment deadline changed";
  }

  return historicalWorkTitle(segment);
}
