"use client";

import { Bell } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatReminderSummary } from "@/lib/clarity/calendar-commitment-form-ui";
import {
  REMINDER_PRESETS,
  customReminderToMinutes,
  formatReminderOffset,
  getAllowedReminderPresets,
  isReminderOffsetAvailable,
  REMINDER_TIME_PASSED_ERROR,
  selectSingleReminderOffset,
  type ReminderCommitmentKind,
  type ReminderScheduleContext,
} from "@/lib/clarity/calendar-reminders";
import { SecondarySettingDisclosure } from "./secondary-setting-disclosure";

export function CalendarReminderField({
  kind,
  offsets,
  onChange,
  scheduleContext,
  expanded,
  onExpandedChange,
  legacyMultipleNotice = false,
  atTimeLabel = "At start time",
}: {
  kind: ReminderCommitmentKind;
  offsets: number[];
  onChange: (offsets: number[]) => void;
  scheduleContext: ReminderScheduleContext;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  legacyMultipleNotice?: boolean;
  atTimeLabel?: string;
}) {
  const allowedPresets = getAllowedReminderPresets(kind);
  const selectedOffset = offsets[0];
  const selectedOffsetIsCustom =
    selectedOffset !== undefined &&
    !(REMINDER_PRESETS as readonly number[]).includes(selectedOffset);
  const initialCustomDraft = getCustomReminderDraft(selectedOffset, kind);
  const [customAmount, setCustomAmount] = useState(initialCustomDraft.amount);
  const [customUnit, setCustomUnit] = useState(initialCustomDraft.unit);
  const [customError, setCustomError] = useState<string | null>(null);
  const [customOpen, setCustomOpen] = useState(selectedOffsetIsCustom);

  const selectPreset = (offset: number) => {
    if (!isReminderOffsetAvailable(kind, offset, scheduleContext)) return;
    onChange(selectSingleReminderOffset(offset));
    setCustomOpen(false);
    setCustomError(null);
  };

  const handleDone = () => {
    if (!customOpen) {
      if (
        selectedOffset !== undefined &&
        !isReminderOffsetAvailable(kind, selectedOffset, scheduleContext)
      ) {
        setCustomError(REMINDER_TIME_PASSED_ERROR);
        return;
      }
      onExpandedChange(false);
      return;
    }

    const amount = Number(customAmount);
    const minutes = customReminderToMinutes(
      amount,
      kind === "date_only_deadline" ? "days" : customUnit,
    );
    if (
      minutes === null ||
      (kind === "date_only_deadline" && minutes % 1440 !== 0)
    ) {
      setCustomError(
        getCustomRangeError(
          kind === "date_only_deadline" ? "days" : customUnit,
        ),
      );
      return;
    }

    if (!isReminderOffsetAvailable(kind, minutes, scheduleContext)) {
      setCustomError(REMINDER_TIME_PASSED_ERROR);
      return;
    }

    onChange(selectSingleReminderOffset(minutes));
    setCustomError(null);
    onExpandedChange(false);
  };

  return (
    <fieldset className="m-0 w-full min-w-0 max-w-full border-0 p-0">
      <legend className="sr-only">Reminders</legend>
      {offsets.map((offset) => (
        <input key={offset} type="hidden" name="reminderOffsets" value={offset} />
      ))}

      <SecondarySettingDisclosure
        icon={Bell}
        label="Reminders"
        summary={
          selectedOffset === 0 ? atTimeLabel : formatReminderSummary(offsets)
        }
        expanded={expanded}
        onExpandedChange={onExpandedChange}
        showDone={false}
      >
        <div className="min-w-0 space-y-3">
          {legacyMultipleNotice && (
            <p className="text-xs leading-5 text-muted-foreground">
              This commitment had multiple reminders. The closest reminder is
              selected; choose the one to keep.
            </p>
          )}
          <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-5">
            {allowedPresets.map((offset) => {
              const selected = !customOpen && selectedOffset === offset;
              const available = isReminderOffsetAvailable(
                kind,
                offset,
                scheduleContext,
              );
              return (
                <button
                  key={offset}
                  type="button"
                  aria-pressed={selected}
                  disabled={!available}
                  onClick={() => selectPreset(offset)}
                  className={`min-h-11 rounded-xl border px-2 text-sm font-medium transition-colors ${
                    selected
                      ? "border-ring bg-secondary text-foreground"
                      : "border-border text-muted-foreground hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                  }`}
                >
                  {offset === 0 ? atTimeLabel : formatReminderOffset(offset)}
                </button>
              );
            })}
            <button
              type="button"
              aria-expanded={customOpen}
              aria-pressed={customOpen}
              onClick={() => {
                if (!customOpen) {
                  onChange([]);
                  setCustomOpen(true);
                }
                setCustomError(null);
              }}
              className={`min-h-11 rounded-xl border px-3 text-sm font-medium transition-colors ${
                customOpen
                  ? "border-ring bg-secondary text-foreground"
                  : "border-border text-muted-foreground hover:bg-secondary"
              }`}
            >
              Custom
            </button>
          </div>

          {customOpen && (
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2">
              <Input
                type="number"
                min="1"
                max={
                  (kind === "date_only_deadline" ? "days" : customUnit) ===
                  "minutes"
                    ? "59"
                    : (kind === "date_only_deadline"
                          ? "days"
                          : customUnit) === "hours"
                      ? "23"
                      : "30"
                }
                step="1"
                inputMode="numeric"
                value={customAmount}
                onChange={(event) => {
                  setCustomAmount(event.target.value);
                  setCustomError(null);
                }}
                placeholder="Amount"
                aria-label="Custom reminder amount"
              />
              <select
                value={kind === "date_only_deadline" ? "days" : customUnit}
                onChange={(event) => {
                  setCustomUnit(
                    event.target.value as "minutes" | "hours" | "days",
                  );
                  setCustomError(null);
                }}
                disabled={kind === "date_only_deadline"}
                aria-label="Custom reminder unit"
                className="h-11 min-w-0 rounded-xl border border-input bg-card px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:text-muted-foreground"
              >
                {kind !== "date_only_deadline" && (
                  <option value="minutes">min</option>
                )}
                {kind !== "date_only_deadline" && (
                  <option value="hours">hours</option>
                )}
                <option value="days">days</option>
              </select>
            </div>
          )}

          <div className="flex min-h-10 items-center justify-between gap-3 text-xs text-muted-foreground">
            {offsets.length > 0 || customOpen ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  onChange([]);
                  setCustomOpen(false);
                  setCustomError(null);
                }}
                className="h-10 px-2 text-xs text-muted-foreground"
              >
                Clear reminder
              </Button>
            ) : (
              <span>No reminders selected</span>
            )}
            <Button
              type="button"
              variant="ghost"
              onClick={handleDone}
              className="h-10 px-3 text-xs"
            >
              Done
            </Button>
          </div>
          {customError && (
            <p role="alert" className="text-xs text-destructive">
              {customError}
            </p>
          )}
        </div>
      </SecondarySettingDisclosure>
    </fieldset>
  );
}

function getCustomRangeError(unit: "minutes" | "hours" | "days") {
  if (unit === "minutes") return "Use 1–59 minutes.";
  if (unit === "hours") return "Use 1–23 hours.";
  return "Use 1–30 days.";
}

function getCustomReminderDraft(
  offset: number | undefined,
  kind: ReminderCommitmentKind,
): { amount: string; unit: "minutes" | "hours" | "days" } {
  if (
    offset === undefined ||
    (REMINDER_PRESETS as readonly number[]).includes(offset)
  ) {
    return {
      amount: "",
      unit: kind === "date_only_deadline" ? "days" : "hours",
    };
  }
  if (kind === "date_only_deadline" || offset % 1440 === 0) {
    return { amount: String(offset / 1440), unit: "days" };
  }
  if (offset % 60 === 0) {
    return { amount: String(offset / 60), unit: "hours" };
  }
  return { amount: String(offset), unit: "minutes" };
}
