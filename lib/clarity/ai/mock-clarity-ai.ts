import { createHash } from "node:crypto";

import type { ClarityAI, ClarityAIInput } from "./clarity-ai";
import { generatedPlanSchema } from "../schemas";

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
  async buildPlan(input: ClarityAIInput) {
    const id = (sortOrder: number) =>
      deterministicUuid(`${input.userId}:${input.localDate}:${sortOrder}`);

    return generatedPlanSchema.parse({
      focus: "Move the job search forward without overloading the day.",
      actions: [
        {
          id: id(0),
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
          sortOrder: 0,
        },
        {
          id: id(1),
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
          sortOrder: 1,
        },
        {
          id: id(2),
          title: "Pick up my sister",
          actionType: "fixed",
          estimatedMinutes: 60,
          scheduledTime: "16:00",
          whyItExists: "This is a fixed commitment that anchors the afternoon.",
          definitionOfDone: "My sister is picked up safely and on time.",
          suggestedMethod:
            "Leave enough travel buffer to arrive a few minutes early.",
          status: "proposed",
          sortOrder: 2,
        },
        {
          id: id(3),
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
          sortOrder: 3,
        },
      ],
    });
  }
}
