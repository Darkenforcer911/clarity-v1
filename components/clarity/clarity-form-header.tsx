"use client";

import { X } from "lucide-react";

import { Button } from "@/components/ui/button";

export function ClarityFormHeader({
  title,
  subtitle,
  closeLabel,
  onClose,
}: {
  title: string;
  subtitle?: string;
  closeLabel: string;
  onClose: () => void;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {subtitle && (
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onClose}
        aria-label={closeLabel}
        className="size-11 min-h-11 min-w-11 shrink-0 rounded-xl"
      >
        <X />
      </Button>
    </div>
  );
}
