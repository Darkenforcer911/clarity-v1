import { z } from "zod";

import type { DailyLoopData } from "./daily-loop-queries";
import { addLocalDays } from "./date-time";

const previousDaySummarySchema = z.object({
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  completedCount: z.number().int().nonnegative(),
  unfinishedActions: z.array(
    z.object({
      outcome: z.string(),
    }),
  ),
});

export type NewDayBriefing = {
  previousLocalDate: string;
  completedCount: number;
  movedCount: number;
  droppedCount: number;
};

export class NewDayBriefingService {
  build(data: DailyLoopData): NewDayBriefing | null {
    if (data.plan) {
      return null;
    }

    const parsed = data.yesterdayRecord
      ? previousDaySummarySchema.safeParse(
          data.yesterdayRecord.progress_recorded,
        )
      : null;

    const summary = parsed?.success ? parsed.data : null;
    const previousLocalDate =
      summary?.localDate ?? addLocalDays(data.localDate, -1);

    return {
      previousLocalDate,
      completedCount: summary?.completedCount ?? 0,
      movedCount:
        summary?.unfinishedActions.filter(
          (action) => action.outcome === "rescheduled",
        ).length ?? 0,
      droppedCount:
        summary?.unfinishedActions.filter(
          (action) => action.outcome === "dropped",
        ).length ?? 0,
    };
  }
}

export const newDayBriefingService = new NewDayBriefingService();
