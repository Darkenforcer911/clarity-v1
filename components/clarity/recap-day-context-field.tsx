"use client";

import { ChevronUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function RecapDayContextField({
  day,
  value,
  open,
  onOpenChange,
  onChange,
}: {
  day: string;
  value: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (value: string) => void;
}) {
  if (open) {
    return (
      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h2 className="font-semibold">Note about {day}</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              Anything meaningful that was not an action.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
            aria-label={`Collapse note about ${day}`}
            className="size-11 shrink-0 rounded-xl"
          >
            <ChevronUp />
          </Button>
        </header>
        <Textarea
          aria-label={`Note about ${day}`}
          value={value}
          maxLength={1000}
          onChange={(event) => onChange(event.currentTarget.value)}
          placeholder="Had a difficult day, spent time with family, something important changed..."
          className="min-h-24 rounded-xl"
        />
      </section>
    );
  }

  return (
    <section className="space-y-2">
      {value ? (
        <div className="rounded-xl bg-card px-4 py-3">
          <p className="line-clamp-3 whitespace-pre-wrap text-sm leading-6">
            {value}
          </p>
          <div className="mt-1 flex gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(true)}
              className="h-9 px-2 text-xs text-muted-foreground"
            >
              Edit
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange("")}
              className="h-9 px-2 text-xs text-muted-foreground"
            >
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onOpenChange(true)}
          className="min-h-11 w-full rounded-xl px-2 text-left text-sm font-medium text-muted-foreground hover:bg-secondary/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          + Add a note about {day}
        </button>
      )}
    </section>
  );
}
