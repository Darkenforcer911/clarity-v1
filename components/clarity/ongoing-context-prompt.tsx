import { Bookmark, Clock3 } from "lucide-react";

import { decideActionContextAction } from "@/app/(app)/today/action-workspace-actions";
import { PendingButton } from "./pending-button";

export function OngoingContextPrompt({
  actionId,
  suggestion,
  destination,
}: {
  actionId: string;
  suggestion: string;
  destination: string;
}) {
  return (
    <div className="rounded-xl bg-card p-4">
      <p className="font-semibold">
        This sounds like something ongoing. Should Clarity remember it?
      </p>
      <p className="mt-2 text-sm text-muted-foreground">{suggestion}</p>
      <div className="mt-4 grid gap-2">
        <DecisionForm
          actionId={actionId}
          destination={destination}
          decision="remembered"
        >
          <Bookmark />
          Remember it
        </DecisionForm>
        <DecisionForm
          actionId={actionId}
          destination={destination}
          decision="once"
          variant="outline"
        >
          Just this once
        </DecisionForm>
        <DecisionForm
          actionId={actionId}
          destination={destination}
          decision="dismissed"
          variant="ghost"
        >
          <Clock3 />
          Not now
        </DecisionForm>
      </div>
    </div>
  );
}

function DecisionForm({
  actionId,
  destination,
  decision,
  variant = "default",
  children,
}: {
  actionId: string;
  destination: string;
  decision: "remembered" | "once" | "dismissed";
  variant?: "default" | "outline" | "ghost";
  children: React.ReactNode;
}) {
  return (
    <form action={decideActionContextAction}>
      <input type="hidden" name="actionId" value={actionId} />
      <input type="hidden" name="destination" value={destination} />
      <input type="hidden" name="decision" value={decision} />
      <PendingButton
        type="submit"
        variant={variant}
        pendingLabel="Saving…"
        className="h-11 w-full rounded-xl"
      >
        {children}
      </PendingButton>
    </form>
  );
}
