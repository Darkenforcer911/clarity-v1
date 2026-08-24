"use client";

import { useActionState, useEffect, useState } from "react";

import {
  createDayCorrectionAction,
  updateDayCorrectionAction,
} from "@/app/(app)/calendar/actions";
import { initialCalendarActionState } from "@/lib/clarity/calendar-action-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type {
  DayCorrection,
  DayCorrectionType,
} from "@/lib/clarity/day-corrections";
import { PendingButton } from "./pending-button";

export function DayCorrectionForm({
  localDate,
  correction,
  onCancel,
  onSaved,
}: {
  localDate: string;
  correction?: DayCorrection;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<DayCorrectionType>(
    correction?.correction_type ?? "completed_item",
  );
  const [state, action] = useActionState(
    correction ? updateDayCorrectionAction : createDayCorrectionAction,
    initialCalendarActionState,
  );
  const duration = correction?.duration_minutes ?? 0;

  useEffect(() => {
    if (state.saved) onSaved();
  }, [state.saved, state.version, onSaved]);

  return (
    <form action={action} className="space-y-5 rounded-2xl border border-border bg-card p-4">
      <input type="hidden" name="localDate" value={localDate} />
      {correction && (
        <input type="hidden" name="correctionId" value={correction.id} />
      )}
      <h2 className="text-lg font-semibold">
        {correction ? "Edit added activity" : "Add something completed"}
      </h2>

      <fieldset className="grid min-w-0 gap-2">
        <legend className="mb-1 text-sm font-medium">Activity type</legend>
        {(
          [
            ["completed_item", "Completed item"],
            ["historical_event", "Event that happened"],
            ["day_note", "Day note"],
          ] as const
        ).map(([value, label]) => (
          <label
            key={value}
            className={`flex min-h-11 cursor-pointer items-center rounded-xl border px-3 text-sm font-medium ${
              type === value
                ? "border-primary bg-primary/15 text-foreground"
                : "border-border text-muted-foreground"
            }`}
          >
            <input
              type="radio"
              name="correctionType"
              value={value}
              checked={type === value}
              onChange={() => setType(value)}
              className="sr-only"
            />
            {label}
          </label>
        ))}
      </fieldset>

      {type === "day_note" ? (
        <Field
          label="What should be added to this day's record?"
          htmlFor="correction-details"
        >
          <Textarea
            id="correction-details"
            name="details"
            defaultValue={correction?.details ?? ""}
            placeholder="Something important happened, I felt..., or the day changed because..."
            maxLength={2000}
            required
          />
        </Field>
      ) : (
        <>
          <Field
            label={
              type === "completed_item"
                ? "What did you complete?"
                : "What happened?"
            }
            htmlFor="correction-title"
          >
            <Input
              id="correction-title"
              name="title"
              defaultValue={correction?.title ?? ""}
              maxLength={200}
              required
            />
          </Field>
          <Field label="Time — optional" htmlFor="correction-time">
            <Input
              id="correction-time"
              type="time"
              name="occurredTime"
              defaultValue={correction?.occurred_time?.slice(0, 5) ?? ""}
            />
          </Field>
          {type === "historical_event" && (
            <>
              <fieldset className="min-w-0 space-y-2">
                <legend className="text-sm font-medium">Duration — optional</legend>
                <div className="grid min-w-0 grid-cols-2 gap-3">
                  <Field label="Hours" htmlFor="correction-duration-hours">
                    <Input
                      id="correction-duration-hours"
                      type="number"
                      name="durationHours"
                      min="0"
                      step="1"
                      inputMode="numeric"
                      defaultValue={Math.floor(duration / 60)}
                    />
                  </Field>
                  <Field label="Minutes" htmlFor="correction-duration-minutes">
                    <Input
                      id="correction-duration-minutes"
                      type="number"
                      name="durationMinutes"
                      min="0"
                      max="59"
                      step="1"
                      inputMode="numeric"
                      defaultValue={duration % 60}
                    />
                  </Field>
                </div>
              </fieldset>
              <Field label="Details — optional" htmlFor="correction-details">
                <Textarea
                  id="correction-details"
                  name="details"
                  defaultValue={correction?.details ?? ""}
                  maxLength={2000}
                  className="min-h-24"
                />
              </Field>
            </>
          )}
        </>
      )}

      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Button type="button" variant="ghost" onClick={onCancel} className="h-11">
          Cancel
        </Button>
        <PendingButton type="submit" pendingLabel="Saving…" className="h-11">
          {correction ? "Save changes" : "Add"}
        </PendingButton>
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
