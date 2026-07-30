import { createHash } from "node:crypto";

import type { ClarityAI, ClarityAIInput } from "./clarity-ai";
import { generatedPlanSchema } from "../schemas";
import { MockReturnRecapInterpreter } from "./mock-return-recap-interpreter";
import type {
  ReturnRecapGapDateRange,
  ReturnRecapPlanAction,
} from "./return-recap-interpreter";

function deterministicUuid(seed: string) {
  const bytes = createHash("sha256").update(seed).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

export class MockClarityAI implements ClarityAI {
  private readonly returnRecapInterpreter =
    new MockReturnRecapInterpreter();

  async interpretReturnRecap(
    input: string,
    previousPlan: ReturnRecapPlanAction[],
    gapDateRange: ReturnRecapGapDateRange,
  ) {
    return this.returnRecapInterpreter.interpretReturnRecap(
      input,
      previousPlan,
      gapDateRange,
    );
  }

  async buildPlan(input: ClarityAIInput) {
    const id = (sortOrder: number) =>
      deterministicUuid(`${input.userId}:${input.localDate}:${sortOrder}`);

    const carriedAction = input.carriedActions.find(
      (action) =>
        action.rescheduleCount < 3 &&
        action.estimatedMinutes <= 120,
    );
    const unplannedCarryover =
      input.previousDay?.unplannedCarryoverCandidates.find(
        (action) =>
          action.estimatedMinutes === null ||
          action.estimatedMinutes <= 120,
      );
    const carryoverProposal = carriedAction
      ? {
          title: carriedAction.title,
          estimatedMinutes: carriedAction.estimatedMinutes,
          whyItExists: carriedAction.whyItExists,
          definitionOfDone: carriedAction.definitionOfDone,
          suggestedMethod: carriedAction.suggestedMethod,
        }
      : unplannedCarryover
        ? {
            title: unplannedCarryover.title,
            estimatedMinutes: unplannedCarryover.estimatedMinutes ?? 30,
            whyItExists:
              "This unfinished work was recorded during the previous-day recap.",
            definitionOfDone: `${unplannedCarryover.title} is brought to a clear stopping point.`,
            suggestedMethod:
              unplannedCarryover.progressNote ||
              "Resume from the progress already made and choose the next concrete step.",
          }
        : null;
    const defaultActions = [
      carryoverProposal
        ? {
            id: id(0),
            title: carryoverProposal.title,
            actionType: "flexible",
            estimatedMinutes: carryoverProposal.estimatedMinutes,
            scheduledTime: null,
            whyItExists: carryoverProposal.whyItExists,
            definitionOfDone: carryoverProposal.definitionOfDone,
            suggestedMethod: carryoverProposal.suggestedMethod,
            status: "proposed",
            sortOrder: 0,
          }
        : null,
      {
        id: id(1),
        title: "Review and update CV",
        actionType: "flexible",
        estimatedMinutes: 45,
        scheduledTime: null,
        whyItExists:
          "A current CV makes every suitable application easier to start.",
        definitionOfDone:
          "The CV reflects recent experience and is ready to tailor.",
        suggestedMethod:
          "Review one section at a time, then do a final clarity pass.",
        status: "proposed",
        sortOrder: 1,
      },
      {
        id: id(2),
        title: "Research 5 suitable roles",
        actionType: "flexible",
        estimatedMinutes: 60,
        scheduledTime: null,
        whyItExists:
          "A focused shortlist turns the job search into concrete options.",
        definitionOfDone:
          "Five relevant roles are saved with company and closing date.",
        suggestedMethod:
          "Use two trusted job boards and stop once five strong matches are saved.",
        status: "proposed",
        sortOrder: 2,
      },
      {
        id: id(3),
        title: "Pick up my sister",
        actionType: input.currentLocalTime < "16:00" ? "fixed" : "flexible",
        estimatedMinutes: 60,
        scheduledTime:
          input.currentLocalTime < "16:00" ? "16:00" : null,
        whyItExists: "This is a commitment that anchors the afternoon.",
        definitionOfDone: "My sister is picked up safely.",
        suggestedMethod:
          "Leave enough travel buffer and confirm the practical details first.",
        status: "proposed",
        sortOrder: 3,
      },
      {
        id: id(4),
        title: "Gym",
        actionType: "flexible",
        estimatedMinutes: 75,
        scheduledTime: null,
        whyItExists:
          "Movement supports energy and creates a useful break from job-search work.",
        definitionOfDone: "A complete gym session is finished.",
        suggestedMethod:
          "Choose the easiest open window and prepare gym gear beforehand.",
        status: "proposed",
        sortOrder: 4,
      },
    ]
      .filter((action): action is NonNullable<typeof action> => Boolean(action))
      .map((action, sortOrder) => ({
        ...action,
        sortOrder,
      }));

    return generatedPlanSchema.parse({
      focus: "Move the job search forward without overloading the day.",
      actions: defaultActions,
    });
  }
}
