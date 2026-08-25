export type LifeModelActionState = {
  error: string | null;
  saved: boolean;
  version: number;
};

export const initialLifeModelActionState: LifeModelActionState = {
  error: null,
  saved: false,
  version: 0,
};
