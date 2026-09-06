import { MessageCircle } from "lucide-react";
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
      {secondary && (
        <div data-day-item-secondary-actions className="space-y-2">
          {secondary}
        </div>
      )}
      {more}
    </div>
  );
}
