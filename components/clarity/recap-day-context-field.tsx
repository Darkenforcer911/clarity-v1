"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function RecapDayContextField({
  day,
  value,
  onChange,
}: {
  day: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);

  return (
    <section className="border-t border-border/70 pt-3">
      {open ? (
        <div className="space-y-3 px-1 pt-2">
          <header className="space-y-1">
            <h2 className="font-semibold">
              Anything Clarity should know?
            </h2>
            <p className="text-sm text-muted-foreground">
              Add anything important that affected the day or happened
              outside the plan.
            </p>
          </header>
          <Textarea
            aria-label={`Additional context from ${day}`}
            value={draft}
            maxLength={1000}
            onChange={(event) =>
              setDraft(event.currentTarget.value)
            }
            placeholder="Spent the day in hospital, closed a client, made £500, received a new deadline..."
            className="min-h-24 rounded-xl"
          />
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDraft(value);
                setOpen(false);
              }}
              className="h-11 rounded-xl"
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!draft.trim()}
              onClick={() => {
                onChange(draft.trim());
                setDraft(draft.trim());
                setOpen(false);
              }}
              className="h-11 rounded-xl"
            >
              Save context
            </Button>
          </div>
        </div>
      ) : value ? (
        <div className="space-y-2 px-2 pt-2">
          <p className="text-sm font-medium text-muted-foreground">
            Context from {day}
          </p>
          <p className="whitespace-pre-wrap text-sm leading-6">
            {value}
          </p>
          <div className="flex gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setDraft(value);
                setOpen(true);
              }}
              className="h-9 px-2 text-xs text-muted-foreground"
            >
              Edit
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onChange("");
                setDraft("");
              }}
              className="h-9 px-2 text-xs text-muted-foreground"
            >
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setDraft("");
            setOpen(true);
          }}
          className="min-h-11 w-full rounded-xl px-2 text-left text-sm font-medium text-muted-foreground hover:bg-secondary/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          What else happened {day}?
        </button>
      )}
    </section>
  );
}
