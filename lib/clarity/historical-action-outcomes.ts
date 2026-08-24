import { z } from "zod";

import type { DaySummary } from "./schemas";

const historicalActionOutcomeRevisionSchema = z.object({
  id: z.string().uuid(),
  daily_action_id: z.string().uuid(),
  new_status: z.enum(["completed", "missed"]).nullable(),
  new_completed_at: z.string().nullable(),
  new_completion_time_unknown: z.boolean(),
  new_rescheduled_for: z.string().nullable(),
  correction_note: z.string().nullable(),
  recorded_at: z.string(),
});

export type HistoricalActionOutcomeRevision = z.infer<
  typeof historicalActionOutcomeRevisionSchema
>;

export function parseHistoricalActionOutcomeRevisions(value: unknown) {
  return z.array(historicalActionOutcomeRevisionSchema).parse(value);
}

export function applyHistoricalActionOutcomeRevisions(
  original: DaySummary,
  revisions: HistoricalActionOutcomeRevision[],
): DaySummary {
  if (revisions.length === 0) return original;

  const originalCompleted = new Map(
    original.completedActions.map((item) => [item.id, item]),
  );
  const originalUnfinished = new Map(
    original.unfinishedActions.map((item) => [item.id, item]),
  );
  const effectiveCompleted = new Map(originalCompleted);
  const effectiveUnfinished = new Map(originalUnfinished);

  for (const revision of revisions) {
    const source =
      originalCompleted.get(revision.daily_action_id) ??
      originalUnfinished.get(revision.daily_action_id);
    if (!source) continue;

    effectiveCompleted.delete(revision.daily_action_id);
    effectiveUnfinished.delete(revision.daily_action_id);

    // A null latest outcome is an append-only "clear correction" revision.
    // It restores the immutable Day Record snapshot as the effective truth.
    if (revision.new_status === null) {
      const completed = originalCompleted.get(revision.daily_action_id);
      const unfinished = originalUnfinished.get(revision.daily_action_id);
      if (completed) effectiveCompleted.set(completed.id, completed);
      if (unfinished) effectiveUnfinished.set(unfinished.id, unfinished);
      continue;
    }

    if (revision.new_status === "completed") {
      effectiveCompleted.set(revision.daily_action_id, {
        id: revision.daily_action_id,
        title: source.title,
        completedAt: revision.new_completed_at,
        completionTimeUnknown: revision.new_completion_time_unknown,
        approximateMinutes: source.approximateMinutes,
      });
      continue;
    }

    effectiveUnfinished.set(revision.daily_action_id, {
      id: revision.daily_action_id,
      title: source.title,
      outcome: "not_done",
      rescheduledFor: null,
      notDoneNote: revision.correction_note,
      approximateMinutes: source.approximateMinutes,
    });
  }

  const completedActions = Array.from(effectiveCompleted.values());
  return {
    ...original,
    completedCount: completedActions.length,
    completedActions,
    unfinishedActions: Array.from(effectiveUnfinished.values()),
  };
}
