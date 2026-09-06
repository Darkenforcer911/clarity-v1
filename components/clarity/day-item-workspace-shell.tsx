"use client";

import { Children } from "react";
import { ChevronDown, MessageCircle } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export function DayItemWorkspaceShell({
  primary,
  clarityHref,
  secondary,
  more,
}: {
  primary?: React.ReactNode;
  clarityHref: string;
  secondary?: React.ReactNode;
  more?: React.ReactNode;
}) {
  return (
    <div data-day-item-workspace-shell className="space-y-3">
      {primary}
      <Button
        asChild
        variant="outline"
        className="h-11 w-full rounded-xl"
      >
        <Link href={clarityHref}>
          <MessageCircle className="size-4 text-primary" />
          Ask Clarity
        </Link>
      </Button>
      {secondary}
      {more}
    </div>
  );
}

export function DayItemSecondaryActions({
  children,
}: {
  children: React.ReactNode;
}) {
  const actions = Children.toArray(children).filter(Boolean);

  if (actions.length === 0) return null;

  return (
    <div
      data-day-item-secondary-actions
      className={`grid gap-2 ${actions.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}
    >
      {actions}
    </div>
  );
}

export function DayItemMoreDisclosure({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div data-day-item-more className="space-y-2">
      <Button
        type="button"
        variant="ghost"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        className="h-10 w-full text-muted-foreground"
      >
        More
        <ChevronDown
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        />
      </Button>
      {open && (
        <div className="grid gap-2 rounded-xl bg-secondary p-3">
          {children}
        </div>
      )}
    </div>
  );
}
