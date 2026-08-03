import { z } from "zod";

export const shapeTodaySchema = z.object({
  contextForToday: z
    .string()
    .trim()
    .max(2000, "Keep this under 2,000 characters.")
    .default(""),
});

export type ShapeTodayInput = z.input<typeof shapeTodaySchema>;
