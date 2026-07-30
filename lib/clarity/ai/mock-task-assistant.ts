import type {
  TaskAssistant,
  TaskAssistantInput,
  TaskAssistantResponse,
  TaskRevisionProposal,
} from "./task-assistant";

const codingPattern =
  /\b(code|coding|build|implement|repository|repo|bug|typescript|javascript|react|next\.?js|supabase|database|api)\b/i;

export class MockTaskAssistant implements TaskAssistant {
  async respond(
    input: TaskAssistantInput,
  ): Promise<TaskAssistantResponse> {
    const question = input.question.toLowerCase();

    if (
      /\b(?:broader goal|overall goal|change my goal|career direction|career path|life direction|overall (?:career )?strategy|bigger strategy|which route|what should my goal|rethink my priorities)\b/.test(
        question,
      )
    ) {
      return {
        mode: "handoff",
        content: "This is bigger than the current action.",
        handoff: { destination: "mentor" },
      };
    }

    const replacementTitle = replacementFrom(input.question);
    if (replacementTitle) {
      return {
        mode: "unblock",
        content: "That is different work, so it should replace the current action rather than rewrite it in place.",
        proposal: replacementProposal(input, replacementTitle),
      };
    }

    const scopedTitle = scopedActionFrom(input.question);
    if (scopedTitle) {
      return {
        mode: "clarify",
        content: "Keep the same action identity, but revise the scope and finish line together.",
        proposal: revision(input, {
          operation: "update",
          summary: `Revise the action to “${scopedTitle}”.`,
          title: scopedTitle,
          definitionOfDone: `${scopedTitle} is finished and the result is checked or recorded.`,
          suggestedMethod: `Start ${scopedTitle.toLowerCase()} with the clearest concrete step, then check the result against the revised done condition.`,
        }),
      };
    }

    if (/\b(drop|remove|not doing)\b/.test(question)) {
      return {
        mode: "unblock",
        content: "Remove this action from today without marking it complete.",
        proposal: revision(input, {
          operation: "drop",
          summary: "Remove this action from today.",
        }),
      };
    }

    if (/\b(move|tomorrow|reschedule)\b/.test(question)) {
      return {
        mode: "unblock",
        content: "Move this action out of today and carry it into tomorrow.",
        proposal: revision(input, {
          operation: "move_tomorrow",
          summary: "Move this action to tomorrow.",
        }),
      };
    }

    if (/\b(more time|longer|extra time|underestimated)\b/.test(question)) {
      const minutes = Math.min(
        1440,
        Math.ceil((input.action.estimated_minutes * 1.5) / 5) * 5,
      );
      return {
        mode: "unblock",
        content: `Allow up to ${minutes} minutes and keep the action coherent.`,
        proposal: revision(input, {
          operation: "update",
          summary: `Increase the duration to ${minutes} minutes.`,
          estimatedMinutes: minutes,
          suggestedMethod: `Use the full ${minutes}-minute window, follow the current best approach, and check the result against the done condition.`,
        }),
      };
    }

    if (
      /\b(easier|lighter|simpler|too much|stuck|blocked|hard|overwhelm)\b/.test(
        question,
      )
    ) {
      const minutes = Math.max(
        5,
        Math.round((input.action.estimated_minutes * 0.6) / 5) * 5,
      );
      const title = easierTitle(input.action.title);
      return {
        mode: "unblock",
        content: "Reduce the scope to one useful result.",
        proposal: revision(input, {
          operation: "update",
          summary: `Make this a smaller ${minutes}-minute action.`,
          title,
          estimatedMinutes: minutes,
          definitionOfDone: `One useful part of “${input.action.title}” is finished and saved or recorded.`,
          suggestedMethod: `Choose the smallest useful part, work on it for ${minutes} minutes, then save or record the result.`,
        }),
      };
    }

    if (/\b(method|approach|different way)\b/.test(question)) {
      return {
        mode: "guide",
        content: "Use a simpler approach while keeping the intended result.",
        proposal: revision(input, {
          operation: "update",
          summary: "Use a clearer, simpler working method.",
          suggestedMethod: `Start with the clearest concrete step, work in one ${Math.min(input.action.estimated_minutes, 25)}-minute block, then check what remains.`,
        }),
      };
    }

    if (/\b(done|finish|finished|scope|smaller result)\b/.test(question)) {
      return {
        mode: "clarify",
        content: "Make the finish line more explicit.",
        proposal: revision(input, {
          operation: "update",
          summary: "Clarify the result without changing the action’s purpose.",
          definitionOfDone: `${input.action.title} has a visible result that is finished, checked, and saved or recorded.`,
        }),
      };
    }

    if (
      /\b(codex|tool|person|delegate|prompt)\b/.test(question) ||
      (codingPattern.test(input.action.title) &&
        /\b(do|start|implement|build|help)\b/.test(question))
    ) {
      return { mode: "escalate", content: buildEscalation(input) };
    }

    if (/\b(how|start|steps|first)\b/.test(question)) {
      return {
        mode: "guide",
        content: [
          `Start with this: ${input.action.suggested_method}`,
          `Keep the next working block to ${Math.min(input.action.estimated_minutes, 25)} minutes.`,
          `Stop when this is true: ${input.action.definition_of_done}`,
        ].join("\n\n"),
      };
    }

    return {
      mode: "clarify",
      content: [
        `You are doing: ${input.action.title}.`,
        `Done means: ${input.action.definition_of_done}`,
        `Best approach: ${input.action.suggested_method}`,
      ].join("\n\n"),
    };
  }
}

function revision(
  input: TaskAssistantInput,
  overrides: Partial<TaskRevisionProposal> &
    Partial<TaskRevisionProposal["action"]>,
): TaskRevisionProposal {
  return {
    operation: overrides.operation ?? "update",
    summary: overrides.summary ?? "Revise this action.",
    action: {
      title: overrides.title ?? input.action.title,
      actionType:
        overrides.actionType ??
        (input.action.action_type === "fixed" ? "fixed" : "flexible"),
      estimatedMinutes:
        overrides.estimatedMinutes ?? input.action.estimated_minutes,
      scheduledTime:
        overrides.scheduledTime === undefined
          ? input.action.scheduled_time
          : overrides.scheduledTime,
      whyItExists:
        overrides.whyItExists ?? input.action.why_it_exists,
      definitionOfDone:
        overrides.definitionOfDone ?? input.action.definition_of_done,
      suggestedMethod:
        overrides.suggestedMethod ?? input.action.suggested_method,
    },
  };
}

function replacementProposal(
  input: TaskAssistantInput,
  title: string,
): TaskRevisionProposal {
  return {
    operation: "replace",
    summary: `Replace “${input.action.title}” with “${title}”.`,
    action: {
      title,
      actionType: "flexible",
      estimatedMinutes: input.action.estimated_minutes,
      scheduledTime: null,
      whyItExists: "This is the work the user says is now needed.",
      definitionOfDone: `${title} is finished and the result is checked or recorded.`,
      suggestedMethod: `Start ${title.toLowerCase()} with the clearest concrete step, then check the result against the action title.`,
    },
  };
}

function replacementFrom(question: string) {
  const directMatch = question.match(
    /(?:replace (?:it|this|the action)?(?:\s+with)?|change (?:it|this)(?:\s+to)?|instead,?\s*(?:do)?)\s+(.+?)[.!?]*$/i,
  );
  const insteadMatch = question.match(
    /(?:i\s+(?:need|want)\s+to|do)\s+(.+?)\s+instead[.!?]*$/i,
  );
  const candidate = directMatch?.[1] ?? insteadMatch?.[1];
  if (!candidate) return null;
  const title = candidate.trim();
  return title.length <= 200
    ? title.charAt(0).toUpperCase() + title.slice(1)
    : null;
}

function scopedActionFrom(question: string) {
  const match = question.match(
    /(?:i\s+only\s+need\s+to|make (?:the action|it) about|change the scope to)\s+(.+?)[.!?]*$/i,
  );
  if (!match?.[1]) return null;
  const title = match[1].trim();
  return title.length <= 200
    ? title.charAt(0).toUpperCase() + title.slice(1)
    : null;
}

function easierTitle(title: string) {
  const base = title.split(/\s+(?:and|&)\s+/i)[0]?.trim() || title;
  return base.length > 150 ? `${base.slice(0, 147).trim()}…` : base;
}

function buildEscalation(input: TaskAssistantInput) {
  const recentUpdate = input.notes[0];
  return [
    "Another tool may help execute this action.",
    `Action: ${input.action.title}`,
    `Done when: ${input.action.definition_of_done}`,
    `Best approach: ${input.action.suggested_method}`,
    recentUpdate ? `Relevant update: ${recentUpdate}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}
