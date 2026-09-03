"use client";

import { NotebookPen } from "lucide-react";
import { useId } from "react";

import { Textarea } from "@/components/ui/textarea";
import { formatDetailsSummary } from "@/lib/clarity/details-ui";
import { SecondarySettingDisclosure } from "./secondary-setting-disclosure";

export function DetailsControl({
  name,
  value,
  onChange,
  maxLength,
  placeholder,
  error,
  expanded,
  onExpandedChange,
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  placeholder: string;
  error?: string;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}) {
  const inputId = useId();

  return (
    <div className="w-full min-w-0 max-w-full">
      <input type="hidden" name={name} value={value} />
      <SecondarySettingDisclosure
        icon={NotebookPen}
        label="Details"
        summary={formatDetailsSummary(value)}
        expanded={expanded}
        onExpandedChange={onExpandedChange}
      >
        <label htmlFor={inputId} className="block min-w-0 space-y-2">
          <span className="block text-sm font-medium text-foreground">
            Anything Clarity should know? (optional)
          </span>
          <Textarea
            id={inputId}
            value={value}
            onChange={(event) => onChange(event.currentTarget.value)}
            maxLength={maxLength}
            placeholder={placeholder}
            aria-invalid={Boolean(error)}
            className="min-h-24"
          />
          {error && (
            <span className="block text-sm text-destructive">
              {error}
            </span>
          )}
        </label>
      </SecondarySettingDisclosure>
    </div>
  );
}
