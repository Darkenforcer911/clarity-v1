export function isActiveCalendarCommitment(
  commitment: { status: string },
) {
  return commitment.status !== "cancelled";
}

export function filterActiveCalendarCommitments<
  Commitment extends { status: string },
>(commitments: readonly Commitment[]) {
  return commitments.filter(isActiveCalendarCommitment);
}
