export type ReturnGapEvidence = {
  actionId: string;
  localDate: string;
  title: string;
  outcome: "completed" | "rescheduled" | "dropped";
  source: "known_action" | "unplanned_completion";
  completedAt: string | null;
  completionTimeUnknown: boolean;
  rescheduledFor: string | null;
  sortOrder: number;
};

type ReturnGapEvidencePlan = {
  localDate: string;
  approvedAt: string | null;
  status: string;
  actions: Array<{
    id: string;
    title: string;
    status: string;
    approvedAt: string | null;
    completionEvidenceOnly: boolean;
    completedAt: string | null;
    completionTimeUnknown: boolean;
    rescheduledFor: string | null;
    sortOrder: number;
  }>;
};

export function collectReturnGapEvidence(
  plans: ReturnGapEvidencePlan[],
) {
  const evidence = new Map<string, ReturnGapEvidence>();

  for (const plan of plans) {
    if (
      plan.approvedAt !== null ||
      !["unshaped", "proposed"].includes(plan.status)
    ) {
      continue;
    }

    for (const action of plan.actions) {
      if (
        action.approvedAt !== null ||
        !["completed", "rescheduled", "dropped"].includes(action.status)
      ) {
        continue;
      }

      evidence.set(action.id, {
        actionId: action.id,
        localDate: plan.localDate,
        title: action.title,
        outcome: action.status as ReturnGapEvidence["outcome"],
        source: action.completionEvidenceOnly
          ? "unplanned_completion"
          : "known_action",
        completedAt: action.completedAt,
        completionTimeUnknown: action.completionTimeUnknown,
        rescheduledFor: action.rescheduledFor,
        sortOrder: action.sortOrder,
      });
    }
  }

  return [...evidence.values()].sort(
    (left, right) =>
      left.localDate.localeCompare(right.localDate) ||
      left.sortOrder - right.sortOrder ||
      left.actionId.localeCompare(right.actionId),
  );
}
