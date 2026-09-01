"use client";

import { NotebookPen } from "lucide-react";
import Link from "next/link";

import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { buildDayClarityHref } from "@/lib/clarity/clarity-action-context";
import { formatDetailsSummary } from "@/lib/clarity/details-ui";

import { SecondarySettingDisclosure } from "./secondary-setting-disclosure";

export function RecapDayContextField({
  day,
  localDate,
  value,
  open,
  onOpenChange,
  onChange,
}: {
  day: string;
  localDate: string;
  value: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (value: string) => void;
}) {
  return (
    <div className="min-w-0">
      <SecondarySettingDisclosure
        icon={NotebookPen}
        label={`Talk to Clarity about ${day}`}
        summary={formatDetailsSummary(value)}
        expanded={open}
        onExpandedChange={onOpenChange}
      >
        <Textarea
          aria-label={`Day reflection for ${day}`}
          value={value}
          maxLength={1000}
          onChange={(event) => onChange(event.currentTarget.value)}
          placeholder="Had a difficult day, spent time with family, something important changed..."
          className="min-h-24"
        />
        <div className="space-y-2">
          <p className="text-xs leading-5 text-muted-foreground">
            Your saved recap and reflection will be attached as context.
          </p>
          <Button asChild type="button" variant="secondary" className="h-10 rounded-xl">
            <Link href={buildDayClarityHref(localDate)}>Talk to Clarity</Link>
          </Button>
        </div>
      </SecondarySettingDisclosure>
    </div>
  );
}
