import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  CircleOff,
  RotateCcw,
} from "lucide-react";

import type { DaySummary as DaySummaryData } from "@/lib/clarity/schemas";
import { formatWeekday } from "@/lib/clarity/date-time";
import { Button } from "@/components/ui/button";

export function DaySummary({
  summary,
  notes,
}: {
  summary: DaySummaryData;
  notes: string | null;
}) {
  return (
    <section className="space-y-7">
      <div className="space-y-3">
        <p className="text-sm font-medium text-blue-100/60">Day Summary</p>
        <h1 className="text-3xl font-semibold tracking-[-0.045em]">
          Progress recorded.
        </h1>
        <p className="max-w-xl text-lg leading-8 text-blue-100/60">
          {summary.focus}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-sky-300/10 p-5 text-[#38a5ff]">
          <p className="text-3xl font-semibold">{summary.completedCount}</p>
          <p className="mt-1 text-sm">Completed</p>
        </div>
        <div className="rounded-2xl bg-[#0c2b62]/90 p-5 text-blue-50/85">
          <p className="text-3xl font-semibold">
            {summary.unfinishedActions.length}
          </p>
          <p className="mt-1 text-sm">Changed</p>
        </div>
      </div>

      <SummarySection title="Completed">
        {summary.completedActions.length > 0 ? (
          summary.completedActions.map((action) => (
            <li key={action.id} className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-sky-300" />
              <span>{action.title}</span>
            </li>
          ))
        ) : (
          <li className="text-blue-100/55">No actions were completed.</li>
        )}
      </SummarySection>

      <SummarySection title="Unfinished or changed">
        {summary.unfinishedActions.length > 0 ? (
          summary.unfinishedActions.map((action) => (
            <li key={action.id} className="flex items-start gap-3">
              {action.outcome === "rescheduled" ? (
                <RotateCcw className="mt-0.5 size-5 shrink-0 text-sky-300" />
              ) : (
                <CircleOff className="mt-0.5 size-5 shrink-0 text-blue-200/60" />
              )}
              <div>
                <p>{action.title}</p>
                <p className="mt-0.5 text-sm text-blue-100/55">
                  {action.outcome === "rescheduled" && action.rescheduledFor
                    ? `Moved to ${formatWeekday(action.rescheduledFor)}`
                    : "Dropped"}
                </p>
              </div>
            </li>
          ))
        ) : (
          <li className="text-blue-100/55">
            Everything in the approved plan was completed.
          </li>
        )}
      </SummarySection>

      {notes && (
        <div className="rounded-3xl border border-sky-200/15 bg-[#0c2b62]/90 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-blue-100/60">
            Relevant notes
          </h2>
          <p className="mt-3 whitespace-pre-wrap leading-7">{notes}</p>
        </div>
      )}

      <Button
        asChild
        size="lg"
        className="h-12 w-full rounded-xl bg-[#148bff] text-base hover:bg-[#0877e0]"
      >
        <Link href="/today">
          Done
          <ArrowRight />
        </Link>
      </Button>
    </section>
  );
}

function SummarySection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-blue-100/60">
        {title}
      </h2>
      <ul className="space-y-4 rounded-3xl border border-sky-200/15 bg-[#0c2b62]/90 p-5">
        {children}
      </ul>
    </section>
  );
}
