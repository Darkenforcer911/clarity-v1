import { AlertTriangle, Clock3, MoveRight } from "lucide-react";

import { approvePlanAction } from "@/app/(app)/today/actions";
import type {
  DailyAction,
  DailyPlan,
  Profile,
} from "@/lib/clarity/daily-loop-queries";
import { formatScheduledTime } from "@/lib/clarity/date-time";
import { AddActionForm } from "./add-action-form";
import { PendingButton } from "./pending-button";
import { ProposedActionCard } from "./proposed-action-card";

type ProposedPlanProps = {
  plan: DailyPlan;
  actions: DailyAction[];
  profile: Profile;
};

export function ProposedPlan({
  plan,
  actions,
  profile,
}: ProposedPlanProps) {
  const totalMinutes = actions.reduce(
    (total, action) => total + action.estimated_minutes,
    0,
  );
  const specificTimeCount = actions.filter(
    (action) => action.action_type === "fixed",
  ).length;
  const load = planLoad(totalMinutes);

  return (
    <section className="space-y-8">
      <div className="space-y-3">
        <p className="text-sm font-medium text-muted-foreground">Proposed Plan</p>
        <h1 className="text-3xl font-semibold tracking-[-0.045em]">
          Today&apos;s focus
        </h1>
        <p className="max-w-xl text-xl leading-8 text-muted-foreground">
          {plan.focus}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <PlanMetric label="Estimated" value={formatDuration(totalMinutes)} />
        <PlanMetric label="Actions" value={String(actions.length)} />
        <PlanMetric label="Specific time" value={String(specificTimeCount)} />
      </div>

      <div
        className={`rounded-2xl border p-4 ${
          load.heavy
            ? "border-border bg-card"
            : "border-[var(--clarity-completed)] bg-secondary"
        }`}
      >
        <div className="flex items-start gap-3">
          {load.heavy ? (
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-primary" />
          ) : (
            <Clock3 className="mt-0.5 size-5 shrink-0 text-[var(--clarity-completed)]" />
          )}
          <div>
            <p className="font-semibold">{load.duration}</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {load.copy}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {actions.map((action) => {
          return (
            <ProposedActionCard
              key={action.id}
              action={action}
              scheduledTime={formatScheduledTime(
                action.scheduled_time,
                profile.timezone,
              )}
              scheduledTimeInput={formatTimeInput(
                action.scheduled_time,
                profile.timezone,
              )}
            />
          );
        })}
      </div>

      <AddActionForm planId={plan.id} proposed />

      <div className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] rounded-2xl bg-background py-2">
        <form action={approvePlanAction}>
          <input type="hidden" name="planId" value={plan.id} />
          <PendingButton
            type="submit"
            size="lg"
            disabled={actions.length === 0}
            pendingLabel="Approving plan…"
            className="h-12 w-full rounded-xl text-base"
          >
            Approve plan
            <MoveRight />
          </PendingButton>
        </form>
      </div>
    </section>
  );
}

function PlanMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-card p-3">
      <p className="text-lg font-semibold">{value}</p>
      <p className="mt-1 text-xs leading-4 text-muted-foreground">{label}</p>
    </div>
  );
}

function planLoad(totalMinutes: number) {
  const duration = `About ${formatDurationWords(totalMinutes)} total`;

  if (totalMinutes > 360) {
    return {
      duration,
      heavy: true,
      copy: "This may be heavy. Consider removing or simplifying one action.",
    };
  }

  return {
    duration,
    heavy: false,
    copy: "This plan looks manageable.",
  };
}

function formatDurationWords(totalMinutes: number) {
  if (totalMinutes < 60) {
    return `${totalMinutes} ${totalMinutes === 1 ? "minute" : "minutes"}`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const hourCopy = `${hours} ${hours === 1 ? "hour" : "hours"}`;

  return minutes === 0
    ? hourCopy
    : `${hourCopy} ${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}

function formatTimeInput(value: string | null, timezone: string) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

function formatDuration(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes} min`;
  }

  return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`;
}
