export type ClarityProposalActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
  completedAt?: number;
};

export const initialClarityProposalActionState: ClarityProposalActionState = {
  status: "idle",
  message: null,
};
