"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatWeekday } from "@/lib/clarity/date-time";
import { AppShell } from "./app-shell";

const recapPlaceholder =
  "I picked up my sister and went to the gym. I didn’t work on my resume, and I got takeaway instead of cooking. I also barely slept.";

export function NaturalRecapScreen({
  recapDate,
  actionTitles,
  value,
  error,
  pending,
  onChange,
  onReview,
  onManualReview,
  contained = false,
  developmentPreview = false,
}: {
  recapDate: string;
  actionTitles: string[];
  value: string;
  error: string | null;
  pending: boolean;
  onChange: (value: string) => void;
  onReview: () => void;
  onManualReview: () => void;
  contained?: boolean;
  developmentPreview?: boolean;
}) {
  const day = formatWeekday(recapDate);

  return (
    <AppShell
      contained={contained}
      enableActivityTracking={!developmentPreview}
      enableTransientNotices={!developmentPreview}
      allowAccountSignOut={!developmentPreview}
      allowProductNavigation={!developmentPreview}
    >
      <section className="space-y-5">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-[-0.045em]">
            What happened {day}?
          </h1>
          <p className="leading-6 text-muted-foreground">
            You planned a few things yesterday. Tell Clarity what
            actually happened — rough details are enough.
          </p>
        </header>

        <p className="rounded-2xl border border-border bg-card px-4 py-3 text-sm leading-6 text-muted-foreground">
          {planSummary(actionTitles)}
        </p>

        <label className="block">
          <span className="sr-only">Natural recap</span>
          <Textarea
            value={value}
            maxLength={5000}
            placeholder={recapPlaceholder}
            onChange={(event) => onChange(event.currentTarget.value)}
            className="min-h-44 resize-y rounded-2xl border-border bg-card p-4 leading-6"
          />
        </label>

        {error && (
          <p
            role="alert"
            className="rounded-xl bg-secondary px-4 py-3 text-sm"
          >
            {error}
          </p>
        )}

        <div className="space-y-2">
          <Button
            type="button"
            size="lg"
            disabled={!value.trim() || pending}
            onClick={onReview}
            className="h-12 w-full rounded-xl text-base"
          >
            {pending ? "Reviewing…" : "Review my recap"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={onManualReview}
            className="h-11 w-full rounded-xl text-muted-foreground"
          >
            Review tasks manually
          </Button>
        </div>
      </section>
    </AppShell>
  );
}

function planSummary(titles: string[]) {
  const normalized = titles.map(lowercaseFirst);

  if (normalized.length === 0) {
    return "Your approved plan is ready to review.";
  }

  if (normalized.length === 1) {
    return `You planned to ${normalized[0]}.`;
  }

  if (normalized.length === 2) {
    return `You planned to ${normalized[0]} and ${normalized[1]}.`;
  }

  return `You planned to ${normalized.slice(0, -1).join(", ")} and ${normalized.at(-1)}.`;
}

function lowercaseFirst(value: string) {
  return value.charAt(0).toLocaleLowerCase() + value.slice(1);
}
