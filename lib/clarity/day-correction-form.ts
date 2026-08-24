import { z } from "zod";

import { dayCorrectionTypes } from "./day-corrections";

const schema = z.object({
  localDate: z.iso.date(),
  correctionType: z.enum(dayCorrectionTypes),
  title: z.string().trim().max(200),
  occurredTime: z.string(),
  durationHours: z.string(),
  durationMinutes: z.string(),
  details: z.string().trim().max(2000),
});

export type DayCorrectionInput = {
  localDate: string;
  correctionType: (typeof dayCorrectionTypes)[number];
  title: string | null;
  occurredTime: string | null;
  durationMinutes: number | null;
  details: string | null;
};

export function parseDayCorrectionForm(formData: FormData):
  | { success: true; data: DayCorrectionInput }
  | { success: false; error: string } {
  const parsed = schema.safeParse({
    localDate: formData.get("localDate"),
    correctionType: formData.get("correctionType"),
    title: String(formData.get("title") ?? ""),
    occurredTime: String(formData.get("occurredTime") ?? ""),
    durationHours: String(formData.get("durationHours") ?? ""),
    durationMinutes: String(formData.get("durationMinutes") ?? ""),
    details: String(formData.get("details") ?? ""),
  });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Check the correction details.",
    };
  }

  const value = parsed.data;
  const occurredTime = value.occurredTime || null;
  if (occurredTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(occurredTime)) {
    return { success: false, error: "Enter a valid time." };
  }

  if (value.correctionType === "day_note") {
    if (!value.details) return { success: false, error: "Add the day note." };
    return {
      success: true,
      data: {
        localDate: value.localDate,
        correctionType: value.correctionType,
        title: null,
        occurredTime: null,
        durationMinutes: null,
        details: value.details,
      },
    };
  }

  if (!value.title) {
    return {
      success: false,
      error:
        value.correctionType === "completed_item"
          ? "Enter what you completed."
          : "Enter what happened.",
    };
  }

  let duration: number | null = null;
  if (value.correctionType === "historical_event") {
    const hours = value.durationHours || "0";
    const minutes = value.durationMinutes || "0";
    if (!/^\d+$/.test(hours) || !/^\d+$/.test(minutes)) {
      return { success: false, error: "Duration must use whole numbers." };
    }
    if (Number(minutes) > 59) {
      return { success: false, error: "Minutes must be between 0 and 59." };
    }
    const total = Number(hours) * 60 + Number(minutes);
    if (total > 1440) {
      return { success: false, error: "Duration must be within one day." };
    }
    duration = total || null;
  }

  return {
    success: true,
    data: {
      localDate: value.localDate,
      correctionType: value.correctionType,
      title: value.title,
      occurredTime,
      durationMinutes: duration,
      details:
        value.correctionType === "historical_event"
          ? value.details || null
          : null,
    },
  };
}
