import { redirect } from "next/navigation";

import {
  AuthenticationRequiredError,
  type DailyLoopData,
} from "@/lib/clarity/daily-loop-queries";
import { dailyLoopService } from "@/lib/clarity/daily-loop-service";

export async function loadTodayForRoute() {
  try {
    return await dailyLoopService.getToday();
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      redirect("/auth/login");
    }

    throw error;
  }
}

export function redirectFromShape(data: DailyLoopData) {
  switch (data.plan?.status) {
    case "proposed":
      redirect("/today/plan");
    case "active":
      redirect("/today");
    case "closing":
      redirect("/today/close");
    case "closed":
      redirect("/today");
    default:
      return;
  }
}

export function redirectFromPlan(data: DailyLoopData) {
  switch (data.plan?.status) {
    case "proposed":
      return;
    case "active":
      redirect("/today");
    case "closing":
      redirect("/today/close");
    case "closed":
      redirect("/today");
    default:
      redirect("/today/shape");
  }
}

export function redirectFromClose(data: DailyLoopData) {
  switch (data.plan?.status) {
    case "closing":
      return;
    case "closed":
      redirect("/today/summary");
    default:
      redirect("/today");
  }
}

export function redirectFromSummary(data: DailyLoopData) {
  if (data.plan?.status !== "closed" || !data.dayRecord) {
    redirect("/today");
  }
}
