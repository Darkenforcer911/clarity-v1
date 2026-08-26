export type LifeModelProposalActionState = {
  status: "idle" | "error";
  message: string | null;
};

export const initialLifeModelProposalActionState: LifeModelProposalActionState = {
  status: "idle",
  message: null,
};
