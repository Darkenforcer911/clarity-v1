export type ProposedReconciliationActionState = {
  error: string | null;
  savedAt?: number;
  dateBoundary?: {
    endedLocalDate: string;
    currentLocalDate: string;
  };
};

export const initialProposedReconciliationActionState: ProposedReconciliationActionState = {
  error: null,
};
