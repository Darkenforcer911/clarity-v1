import type { DailyAction, DailyPlan } from "../daily-loop-queries";

export type TaskAssistantMode =
  | "clarify"
  | "guide"
  | "unblock"
  | "escalate"
  | "handoff";
export type TaskRevisionProposal = {
  operation: "update" | "move_tomorrow" | "drop" | "replace";
  summary: string;
  action: {
    title: string;
    actionType: "fixed" | "flexible";
    estimatedMinutes: number;
    scheduledTime: string | null;
    whyItExists: string;
    definitionOfDone: string;
    suggestedMethod: string;
  };
};

export type TaskAssistantInput = {
  action: DailyAction;
  plan: DailyPlan;
  question: string;
  notes: string[];
};

export type TaskAssistantResponse = {
  mode: TaskAssistantMode;
  content: string;
  proposal?: TaskRevisionProposal;
  handoff?: {
    destination: "mentor";
  };
};

export interface TaskAssistant {
  respond(input: TaskAssistantInput): Promise<TaskAssistantResponse>;
}

const proposalMarker = "\n\n[[clarity-change:";
const handoffMarker = "\n\n[[clarity-handoff:";

export function encodeTaskAssistantResponse(
  response: TaskAssistantResponse,
) {
  if (response.proposal) {
    return `${response.content}${proposalMarker}${JSON.stringify(response.proposal)}]]`;
  }

  if (response.handoff) {
    return `${response.content}${handoffMarker}${JSON.stringify(response.handoff)}]]`;
  }

  return response.content;
}

export function parseTaskAssistantContent(content: string): {
  content: string;
  proposal: TaskRevisionProposal | null;
  handoff: { destination: "mentor" } | null;
} {
  const markerIndex = content.lastIndexOf(proposalMarker);
  const handoffMarkerIndex = content.lastIndexOf(handoffMarker);

  if (handoffMarkerIndex >= 0 && content.endsWith("]]")) {
    try {
      const handoff = JSON.parse(
        content.slice(handoffMarkerIndex + handoffMarker.length, -2),
      ) as { destination?: string };

      if (handoff.destination === "mentor") {
        return {
          content: content.slice(0, handoffMarkerIndex),
          proposal: null,
          handoff: { destination: "mentor" },
        };
      }
    } catch {
      return { content, proposal: null, handoff: null };
    }
  }

  if (markerIndex < 0 || !content.endsWith("]]")) {
    return { content, proposal: null, handoff: null };
  }

  try {
    const proposal = JSON.parse(
      content.slice(markerIndex + proposalMarker.length, -2),
    ) as TaskRevisionProposal;

    if (
      !["update", "move_tomorrow", "drop", "replace"].includes(
        proposal.operation,
      ) ||
      typeof proposal.summary !== "string" ||
      !isRevisionAction(proposal.action)
    ) {
      return { content, proposal: null, handoff: null };
    }

    return {
      content: content.slice(0, markerIndex),
      proposal,
      handoff: null,
    };
  } catch {
    return { content, proposal: null, handoff: null };
  }
}

function isRevisionAction(
  value: TaskRevisionProposal["action"] | undefined,
): value is TaskRevisionProposal["action"] {
  return Boolean(
    value &&
      typeof value.title === "string" &&
      ["fixed", "flexible"].includes(value.actionType) &&
      Number.isInteger(value.estimatedMinutes) &&
      value.estimatedMinutes >= 1 &&
      value.estimatedMinutes <= 1440 &&
      (value.scheduledTime === null ||
        typeof value.scheduledTime === "string") &&
      typeof value.whyItExists === "string" &&
      typeof value.definitionOfDone === "string" &&
      typeof value.suggestedMethod === "string",
  );
}
