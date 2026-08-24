import { z } from "zod";

export const dayCorrectionTypes = [
  "completed_item",
  "historical_event",
  "day_note",
] as const;

export type DayCorrectionType = (typeof dayCorrectionTypes)[number];

const dayCorrectionSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  local_date: z.iso.date(),
  correction_type: z.enum(dayCorrectionTypes),
  title: z.string().nullable(),
  occurred_time: z.string().nullable(),
  duration_minutes: z.number().int().nullable(),
  details: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type DayCorrection = z.infer<typeof dayCorrectionSchema>;

export function parseDayCorrections(value: unknown) {
  return z.array(dayCorrectionSchema).parse(value);
}

export function dayCorrectionLabel(type: DayCorrectionType) {
  if (type === "completed_item") return "Completed item";
  if (type === "historical_event") return "Event that happened";
  return "Day note";
}
