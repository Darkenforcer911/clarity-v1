import { Check, Clock3, LockKeyhole, MoveRight } from "lucide-react";

import { approvePlanAction } from "@/app/(app)/today/actions";
import type {
  DailyAction,
  DailyPlan,
  Profile,
} from "@/lib/clarity/daily-loop-queries";
import { formatScheduledTime } from "@/lib/clarity/date-time";
import { PendingButton } from "./pending-button";

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

  return (
    <section className="space-y-8">
      <div className="space-y-3">
        <p className="text-sm font-medium text-blue-100/60">Proposed Plan</p>
        <h1 className="text-3xl font-semibold tracking-[-0.045em]">
          Today&apos;s focus
        </h1>
        <p className="max-w-xl text-xl leading-8 text-blue-50/85">
          {plan.focus}
        </p>
      </div>

      <div className="flex items-center gap-2 text-sm text-blue-100/60">
        <Clock3 className="size-4" />
        <span>{formatDuration(totalMinutes)} total</span>
        <span aria-hidden="true">·</span>
        <span>{actions.length} actions</span>
      </div>

      <div className="space-y-4">
        {actions.map((action) => {
          const scheduledTime = formatScheduledTime(
            action.scheduled_time,
            profile.timezone,
          );

          return (
            <article
              key={action.id}
              className="rounded-3xl border border-sky-200/15 bg-[#0c2b62]/90 p-5 shadow-sm sm:p-6"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-sky-300/10 px-2.5 py-1 text-xs font-medium capitalize text-sky-100/75">
                      {action.action_type}
                    </span>
                    <span className="text-xs text-blue-100/55">
                      {action.estimated_minutes} min
                    </span>
                    {scheduledTime && (
                      <span className="flex items-center gap-1 text-xs font-medium text-[#38a5ff]">
                        <LockKeyhole className="size-3" />
                        {scheduledTime}
                      </span>
                    )}
                  </div>
                  <h2 className="text-lg font-semibold tracking-[-0.02em]">
                    {action.title}
                  </h2>
                </div>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sky-300/10 text-[#38a5ff]">
                  <Check className="size-4" />
                </span>
              </div>

              <dl className="mt-5 grid gap-4 border-t border-sky-200/15 pt-5 text-sm sm:grid-cols-3">
                <div>
                  <dt className="font-medium text-blue-50">Why it exists</dt>
                  <dd className="mt-1 leading-6 text-blue-100/60">
                    {action.why_it_exists}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-blue-50">
                    Definition of done
                  </dt>
                  <dd className="mt-1 leading-6 text-blue-100/60">
                    {action.definition_of_done}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-blue-50">
                    Suggested method
                  </dt>
                  <dd className="mt-1 leading-6 text-blue-100/60">
                    {action.suggested_method}
                  </dd>
                </div>
              </dl>
            </article>
          );
        })}
      </div>

      <form action={approvePlanAction} className="sticky bottom-4">
        <input type="hidden" name="planId" value={plan.id} />
        <PendingButton
          type="submit"
          size="lg"
          pendingLabel="Approving plan…"
          className="h-12 w-full rounded-xl bg-[#148bff] text-base shadow-lg hover:bg-[#0877e0]"
        >
          Approve plan
          <MoveRight />
        </PendingButton>
      </form>
    </section>
  );
}

function formatDuration(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes} min`;
  }

  return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`;
}
