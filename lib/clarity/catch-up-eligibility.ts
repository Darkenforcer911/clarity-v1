export const CATCH_UP_ELIGIBLE_STATUSES = [
  "active",
  "completed",
] as const;

export type CatchUpEligibilityAction = {
  approved_at: string | null;
  status: string;
};

export function isCatchUpEligibleAction(
  action: CatchUpEligibilityAction,
) {
  return (
    action.approved_at !== null &&
    CATCH_UP_ELIGIBLE_STATUSES.some(
      (status) => status === action.status,
    )
  );
}
