import {
  ArrowRight,
  Check,
  CheckCircle2,
  Circle,
  Clock3,
} from "lucide-react";

import {
  beginCloseDayAction,
  setActionCompletionAction,
} from "@/app/(app)/today/actions";
import type {
  DailyAction,
  DailyPlan,
  Profile,
} from "@/lib/clarity/daily-loop-queries";
import { formatScheduledTime } from "@/lib/clarity/date-time";
import { PendingButton } from "./pending-button";

type ActiveTodayProps = {
  plan: DailyPlan;
  actions: DailyAction[];
  profile: Profile;
};

export function ActiveToday({ plan, actions, profile }: ActiveTodayProps) {
  const remaining = actions.filter((action) => action.status === "active");
  const completed = actions.filter((action) => action.status === "completed");
  const nextAction = remaining[0];
  const laterActions = remaining.slice(1);
  const total = remaining.length + completed.length;

  return (
    <section className="space-y-7">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-100/60">
          Active Today
        </p>
        <h2 className="text-xl font-semibold leading-7 tracking-[-0.025em]">
          {plan.focus}
        </h2>
        <p className="text-blue-100/60">
          {remaining.length} remaining · {total} total
        </p>
      </div>

      {nextAction ? (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-blue-100/60">
            Next action
          </h2>
          <ActionCard
            action={nextAction}
            timezone={profile.timezone}
            prominent
          />
        </div>
      ) : (
        <div className="rounded-3xl bg-sky-300/10 p-6 text-[#38a5ff]">
          <CheckCircle2 className="mb-4 size-7" />
          <h2 className="text-xl font-semibold">Everything is complete.</h2>
          <p className="mt-2 text-sm leading-6">
            Close the day when you&apos;re ready to record your progress.
          </p>
        </div>
      )}

      {laterActions.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-blue-100/60">
            Remaining actions
          </h2>
          <div className="space-y-3">
            {laterActions.map((action) => (
              <ActionCard
                key={action.id}
                action={action}
                timezone={profile.timezone}
              />
            ))}
          </div>
        </div>
      )}

      {completed.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-blue-100/60">
            Completed
          </h2>
          <div className="space-y-3">
            {completed.map((action) => (
              <ActionCard
                key={action.id}
                action={action}
                timezone={profile.timezone}
              />
            ))}
          </div>
        </div>
      )}

      <form action={beginCloseDayAction} className="border-t border-sky-200/20 pt-8">
        <input type="hidden" name="planId" value={plan.id} />
        <PendingButton
          type="submit"
          variant="outline"
          size="lg"
          pendingLabel="Opening Close Day…"
          className="h-12 w-full rounded-xl border-sky-200/25 bg-transparent text-base text-[#38a5ff]"
        >
          Close day
          <ArrowRight />
        </PendingButton>
      </form>
    </section>
  );
}

function ActionCard({
  action,
  timezone,
  prominent = false,
}: {
  action: DailyAction;
  timezone: string;
  prominent?: boolean;
}) {
  const completed = action.status === "completed";
  const scheduledTime = formatScheduledTime(action.scheduled_time, timezone);

  return (
    <article
      className={`rounded-2xl border p-4 shadow-sm sm:p-5 ${
        prominent
          ? "border-sky-200/20 bg-[#148bff] text-white"
          : completed
            ? "border-sky-200/15 bg-[#0b285f]/60"
            : "border-sky-200/15 bg-[#0c2b62]/90"
      }`}
    >
      <div className="flex items-start gap-4">
        <form action={setActionCompletionAction}>
          <input type="hidden" name="actionId" value={action.id} />
          <input
            type="hidden"
            name="completed"
            value={completed ? "false" : "true"}
          />
          <button
            type="submit"
            className={`mt-0.5 flex size-8 items-center justify-center rounded-full transition ${
              prominent
                ? "bg-[#0c2b62]/90 text-[#38a5ff] hover:bg-white/90"
                : completed
                  ? "bg-sky-300/20 text-[#38a5ff]"
                  : "border border-sky-200/30 text-blue-100/60 hover:border-[#38a5ff] hover:text-[#38a5ff]"
            }`}
            aria-label={
              completed
                ? `Mark ${action.title} incomplete`
                : `Mark ${action.title} complete`
            }
          >
            {completed ? (
              <Check className="size-4" />
            ) : (
              <Circle className="size-4" />
            )}
          </button>
        </form>
        <div className="min-w-0 flex-1">
          <h3
            className={`font-semibold tracking-[-0.015em] ${
              completed ? "text-blue-100/40 line-through" : ""
            }`}
          >
            {action.title}
          </h3>
          <div
            className={`mt-2 flex flex-wrap items-center gap-2 text-xs ${
              prominent ? "text-white/70" : "text-blue-100/55"
            }`}
          >
            <span className="capitalize">{action.action_type}</span>
            <span>·</span>
            <span>{action.estimated_minutes} min</span>
            {scheduledTime && (
              <>
                <span>·</span>
                <span className="flex items-center gap-1">
                  <Clock3 className="size-3" />
                  {scheduledTime}
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
