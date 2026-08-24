export type CalendarActionState = {
  error: string | null;
  saved: boolean;
  version: number;
};

export const initialCalendarActionState: CalendarActionState = {
  error: null,
  saved: false,
  version: 0,
};
