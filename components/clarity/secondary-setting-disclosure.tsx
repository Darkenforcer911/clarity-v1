"use client";

import { ChevronDown, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

export function SecondarySettingStack({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      data-slot="secondary-setting-stack"
      className="grid w-full min-w-0 max-w-full gap-3 [&>*]:m-0"
    >
      {children}
    </div>
  );
}

export function SecondarySettingDisclosure({
  icon: Icon,
  label,
  summary,
  expanded,
  onExpandedChange,
  onDone,
  showDone = true,
  children,
}: {
  icon: LucideIcon;
  label: string;
  summary: string;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onDone?: () => void;
  showDone?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-3">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => onExpandedChange(!expanded)}
        className={`flex min-h-14 w-full min-w-0 items-center gap-3 rounded-xl border bg-secondary px-3 py-2 text-left text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${expanded ? "border-ring" : "border-border"}`}
      >
        <Icon className="size-4 shrink-0 text-ring" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-foreground">
            {label}
          </span>
          <span className="block truncate text-sm text-muted-foreground">
            {summary}
          </span>
        </span>
        <ChevronDown
          className={`size-4 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {expanded && (
        <div className="space-y-3 pl-1">
          {children}
          {showDone && (
            <div className="flex justify-end">
              <Button
                type="button"
                variant="ghost"
                onClick={onDone ?? (() => onExpandedChange(false))}
                className="h-10 px-3 text-xs"
              >
                Done
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
