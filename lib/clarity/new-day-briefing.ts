import type { DailyLoopData } from "./daily-loop-queries";
import { getDayPeriod } from "./date-time";
import { daySummarySchema } from "./schemas";

export type CalendarBriefingItem = {
  id: string;
  label: string;
  startsAt: string;
};

export interface CalendarBriefingSource {
  getItems(input: {
    localDate: string;
    timezone: string;
  }): Promise<CalendarBriefingItem[]>;
}

export type NewDayBriefing = {
  dayRecordId: string;
  previousLocalDate: string;
  completedCount: number;
  movedCount: number;
  droppedCount: number;
  carriedActions: Array<{ id: string; title: string }>;
  explanation: string | null;
  ongoingContextCandidate: {
    label: string;
    sourceText: string;
  } | null;
  calendarItems: CalendarBriefingItem[];
  lateNight: boolean;
};

export class NewDayBriefingService {
  constructor(
    private readonly calendarSource: CalendarBriefingSource | null = null,
  ) {}

  async build(data: DailyLoopData): Promise<NewDayBriefing | null> {
    if (!data.yesterdayRecord) {
      return null;
    }

    const parsed = daySummarySchema.safeParse(
      data.yesterdayRecord.progress_recorded,
    );

    if (!parsed.success) {
      return null;
    }

    const summary = parsed.data;
    const calendarItems = this.calendarSource
      ? await this.calendarSource.getItems({
          localDate: data.localDate,
          timezone: data.profile.timezone,
        })
      : [];
    const explanation = data.yesterdayRecord.notes?.trim() || null;

    return {
      dayRecordId: data.yesterdayRecord.id,
      previousLocalDate: summary.localDate,
      completedCount: summary.completedCount,
      movedCount: summary.unfinishedActions.filter(
        (action) => action.outcome === "rescheduled",
      ).length,
      droppedCount: summary.unfinishedActions.filter(
        (action) => action.outcome === "dropped",
      ).length,
      carriedActions: data.rescheduledContext.map((action) => ({
        id: action.id,
        title: action.title,
      })),
      explanation:
        explanation && explanation.length <= 280 ? explanation : null,
      ongoingContextCandidate:
        summary.ongoingContextCandidate &&
        !summary.ongoingContextCandidate.decision
          ? {
              label: summary.ongoingContextCandidate.label,
              sourceText: summary.ongoingContextCandidate.sourceText,
            }
          : null,
      calendarItems,
      lateNight:
        getDayPeriod(data.profile.timezone) === "late_night",
    };
  }
}

export const newDayBriefingService = new NewDayBriefingService();
