export function isActiveCalendarCommitment(
  commitment: { status: string; reconciliation_outcome?: string | null },
) {
  return (
    commitment.status !== "cancelled" ||
    commitment.reconciliation_outcome === "cancelled"
  );
}

export function filterActiveCalendarCommitments<
  Commitment extends { status: string; reconciliation_outcome?: string | null },
>(commitments: readonly Commitment[]) {
  return commitments.filter(isActiveCalendarCommitment);
}

export function isTodayCalendarCommitment(
  commitment: { status: string; reconciliation_outcome?: string | null },
) {
  return (
    commitment.status !== "cancelled" &&
    commitment.reconciliation_outcome !== "cancelled"
  );
}

export function filterTodayCalendarCommitments<
  Commitment extends { status: string; reconciliation_outcome?: string | null },
>(commitments: readonly Commitment[]) {
  return commitments.filter(isTodayCalendarCommitment);
}
