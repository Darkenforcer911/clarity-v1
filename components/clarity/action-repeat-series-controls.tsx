"use client";

import { useActionState, useEffect, useState } from "react";

import {
  changeActionRepeatAction,
  stopActionRepeatingAction,
} from "@/app/(app)/today/action-workspace-actions";
import { Button } from "@/components/ui/button";
import { initialDailyLoopActionState } from "@/lib/clarity/action-state";
import {
  formatActionRecurrenceSummary,
  getActionRecurrencePrimaryChoice,
  resolveActionRecurrencePrimaryChoice,
} from "@/lib/clarity/action-recurrence";
import { RecurrenceControl } from "./recurrence-control";
import { PendingButton } from "./pending-button";

const weekdays = [
  [1, "M", "Monday"],
  [2, "T", "Tuesday"],
  [3, "W", "Wednesday"],
  [4, "T", "Thursday"],
  [5, "F", "Friday"],
  [6, "S", "Saturday"],
  [0, "S", "Sunday"],
] as const;

export function ActionRepeatSeriesControls({
  actionId,
  actionTitle,
  cadence,
  selectedWeekdays,
  onSaved,
}: {
  actionId: string;
  actionTitle: string;
  cadence: "daily" | "weekly" | "times_per_week" | "certain_days";
  selectedWeekdays: number[];
  onSaved: () => void;
}) {
  const initialPattern = cadence === "times_per_week" ? "weekly" : cadence;
  const [panel, setPanel] = useState<"change" | "stop" | null>(null);
  const [pattern, setPattern] = useState(initialPattern);
  const [days, setDays] = useState(selectedWeekdays);
  const [changeState, changeAction] = useActionState(
    changeActionRepeatAction,
    initialDailyLoopActionState,
  );
  const [stopState, stopAction] = useActionState(
    stopActionRepeatingAction,
    initialDailyLoopActionState,
  );

  useEffect(() => {
    if (changeState.success || stopState.success) onSaved();
  }, [changeState.success, onSaved, stopState.success]);

  if (panel === "change") {
    return (
      <form action={changeAction} className="space-y-3 rounded-xl bg-secondary p-3">
        <input type="hidden" name="actionId" value={actionId} />
        <input type="hidden" name="recurrencePattern" value={pattern} />
        {pattern === "certain_days" &&
          days.map((day) => (
            <input key={day} type="hidden" name="recurrenceDays" value={day} />
          ))}
        <RecurrenceControl
          expanded
          summary={formatActionRecurrenceSummary(pattern, days)}
          value={getActionRecurrencePrimaryChoice(pattern)}
          onExpandedChange={(expanded) => {
            if (!expanded) setPanel(null);
          }}
          onChange={(choice) => {
            const next = resolveActionRecurrencePrimaryChoice(choice);
            if (
              next !== "daily" &&
              next !== "weekly" &&
              next !== "certain_days"
            ) return;
            if (next !== "certain_days") setDays([]);
            setPattern(next);
          }}
          choices={[
            { value: "daily", label: "Daily" },
            { value: "weekly", label: "Weekly" },
            { value: "custom", label: "Custom" },
          ]}
          showDone={false}
        >
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Repeat on</p>
            <div className="grid grid-cols-7 gap-1.5">
              {weekdays.map(([value, label, name]) => {
                const selected = days.includes(value);
                return (
                  <label
                    key={value}
                    aria-label={name}
                    className={`flex aspect-square cursor-pointer items-center justify-center rounded-full border text-xs font-semibold ${selected ? "border-ring bg-card text-foreground" : "border-border text-muted-foreground"}`}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() =>
                        setDays((current) =>
                          current.includes(value)
                            ? current.filter((day) => day !== value)
                            : [...current, value],
                        )
                      }
                      className="sr-only"
                    />
                    {label}
                  </label>
                );
              })}
            </div>
          </div>
        </RecurrenceControl>
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="ghost" onClick={() => setPanel(null)}>
            Cancel
          </Button>
          <PendingButton type="submit" pendingLabel="Saving…">
            Save
          </PendingButton>
        </div>
        {changeState.error && (
          <p role="alert" className="text-xs text-destructive">{changeState.error}</p>
        )}
      </form>
    );
  }

  if (panel === "stop") {
    return (
      <div className="space-y-3 rounded-xl bg-secondary p-3">
        <div className="space-y-1">
          <p className="text-sm font-medium">Stop repeating “{actionTitle}”?</p>
          <p className="text-xs leading-5 text-muted-foreground">
            Future occurrences will no longer be created. Past activity will
            remain in your history.
          </p>
        </div>
        <form action={stopAction} className="grid grid-cols-2 gap-2">
          <input type="hidden" name="actionId" value={actionId} />
          <Button type="button" variant="ghost" onClick={() => setPanel(null)}>
            Cancel
          </Button>
          <PendingButton type="submit" variant="destructive" pendingLabel="Stopping…">
            Stop repeating
          </PendingButton>
        </form>
        {stopState.error && (
          <p role="alert" className="text-xs text-destructive">{stopState.error}</p>
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-2 rounded-xl bg-secondary p-3">
      <Button type="button" variant="ghost" onClick={() => setPanel("change")}>
        Change repeat
      </Button>
      <Button
        type="button"
        variant="ghost"
        onClick={() => setPanel("stop")}
        className="text-muted-foreground"
      >
        Stop repeating
      </Button>
    </div>
  );
}
