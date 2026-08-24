type PreviousPlanBoundary = {
  localDate: string;
  status: string;
  approvedAt: string | null;
  hasBlockingActions: boolean;
};

type PreviousDayRoutingInput = {
  currentLocalDate: string;
  previousPlan: PreviousPlanBoundary | null;
  latestClosedPlanDate: string | null;
  latestGapEndDate: string | null;
};

export type PreviousDayRouting =
  | { kind: "quick_recap"; localDate: string }
  | { kind: "gap"; gapStartDate: string; gapEndDate: string }
  | { kind: "inconsistent_unapproved_plan"; localDate: string }
  | { kind: "resolved" };

export function resolvePreviousDayRouting({
  currentLocalDate,
  previousPlan,
  latestClosedPlanDate,
  latestGapEndDate,
}: PreviousDayRoutingInput): PreviousDayRouting {
  const yesterdayDate = addLocalDays(currentLocalDate, -1);
  const hasUnresolvedApprovedPlan =
    previousPlan?.approvedAt !== null &&
    previousPlan?.approvedAt !== undefined &&
    ["proposed", "active", "closing"].includes(
      previousPlan.status,
    );

  if (previousPlan && hasUnresolvedApprovedPlan) {
    return {
      kind: "quick_recap",
      localDate: previousPlan.localDate,
    };
  }

  if (
    previousPlan &&
    previousPlan.approvedAt === null &&
    (["active", "closing"].includes(previousPlan.status) ||
      previousPlan.hasBlockingActions)
  ) {
    return {
      kind: "inconsistent_unapproved_plan",
      localDate: previousPlan.localDate,
    };
  }

  const resolvedAnchor = latestDate(
    latestClosedPlanDate,
    latestGapEndDate,
  );
  const gapStartDate = resolvedAnchor
    ? addLocalDays(resolvedAnchor, 1)
    : previousPlan &&
        ["unshaped", "proposed"].includes(previousPlan.status)
      ? previousPlan.localDate
      : yesterdayDate;

  if (gapStartDate <= yesterdayDate) {
    return {
      kind: "gap",
      gapStartDate,
      gapEndDate: yesterdayDate,
    };
  }

  return { kind: "resolved" };
}

function latestDate(left: string | null, right: string | null) {
  if (!left) return right;
  if (!right) return left;
  return left > right ? left : right;
}

function addLocalDays(localDate: string, days: number) {
  const [year, month, day] = localDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));

  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}
