"use client";

import { ChevronDown, Clock3, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatCommitmentTime } from "@/lib/clarity/calendar-rules";

export function OptionalTimeSelector({
  name,
  label = "Time",
  value,
  onChange,
  expanded,
  onExpandedChange,
  error,
}: {
  name: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  error?: string;
}) {
  return (
    <div className="w-full min-w-0 max-w-full">
      <TimeSelector
        name={name}
        label={label}
        value={value}
        onChange={onChange}
        expanded={expanded}
        onExpandedChange={onExpandedChange}
        summary={formatCommitmentTime(value) ?? "Anytime"}
        onRemove={
          value
            ? () => {
                onChange("");
                onExpandedChange(false);
              }
            : undefined
        }
        error={error}
      />
    </div>
  );
}

export function TimeSelector({
  name,
  label,
  hideLabel = false,
  value,
  onChange,
  onExpandedChange,
  summary,
  onRemove,
  error,
}: {
  name?: string;
  label: string;
  hideLabel?: boolean;
  value: string;
  onChange: (value: string) => void;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  summary?: string;
  onRemove?: () => void;
  error?: string;
}) {
  if (summary !== undefined) {
    return (
      <div data-slot="when-time-selector" className="min-w-0 space-y-2">
        <label className="flex min-h-14 w-full min-w-0 cursor-pointer items-center gap-3 rounded-xl border border-border bg-secondary px-3 py-2 text-left text-foreground focus-within:border-ring focus-within:ring-2 focus-within:ring-ring">
          <input
            type="time"
            name={name}
            value={value}
            aria-label={label}
            aria-invalid={Boolean(error)}
            onChange={(event) => onChange(event.currentTarget.value)}
            className="sr-only"
          />
          <Clock3 className="size-4 shrink-0 text-ring" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-foreground">
              {label}
            </span>
            <span className="block truncate text-sm text-muted-foreground">
              {summary}
            </span>
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </label>

        {value && onRemove && (
          <Button
            type="button"
            variant="ghost"
            onClick={onRemove}
            className="h-10 w-auto justify-start rounded-lg px-2 text-xs text-muted-foreground"
          >
            <X />
            Remove time
          </Button>
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <label
      data-slot="clarity-time-selector"
      className="block min-w-0"
    >
      <span className={hideLabel ? "sr-only" : "block text-sm font-medium"}>
        {label}
      </span>
      <input
        type="time"
        name={name}
        value={value}
        aria-label={label}
        aria-invalid={Boolean(error)}
        onPointerDown={() => onExpandedChange?.(true)}
        onFocus={() => onExpandedChange?.(true)}
        onChange={(event) => {
          onChange(event.currentTarget.value);
        }}
        className={`${hideLabel ? "" : "mt-2 "}block min-h-12 w-full min-w-0 max-w-full rounded-xl border border-input bg-card px-3 py-2 font-sans text-base leading-normal text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
      />

      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </label>
  );
}
