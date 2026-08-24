"use client";

import { NotebookPen } from "lucide-react";

import { Textarea } from "@/components/ui/textarea";
import { formatDetailsSummary } from "@/lib/clarity/details-ui";

import { SecondarySettingDisclosure } from "./secondary-setting-disclosure";

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
  return (
    <div className="min-w-0">
      <SecondarySettingDisclosure
        icon={NotebookPen}
        label={`Note about ${day}`}
        summary={formatDetailsSummary(value)}
        expanded={open}
        onExpandedChange={onOpenChange}
      >
        <Textarea
          aria-label={`Note about ${day}`}
          value={value}
          maxLength={1000}
          onChange={(event) => onChange(event.currentTarget.value)}
          placeholder="Had a difficult day, spent time with family, something important changed..."
          className="min-h-24"
        />
      </SecondarySettingDisclosure>
    </div>
  );
}
