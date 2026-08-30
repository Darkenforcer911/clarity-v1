import { Compass } from "lucide-react";

export default function ClarityPage() {
  return (
    <div className="space-y-6" data-slot="clarity-conversation-skeleton">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-[-0.04em]">
          Clarity
        </h1>
        <p className="max-w-sm text-sm leading-6 text-muted-foreground">
          Think through what matters, explore your options, and work out what
          to do next.
        </p>
      </header>

      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="grid size-11 place-items-center rounded-xl bg-primary/15 text-primary">
          <Compass className="size-5" aria-hidden="true" />
        </div>
        <div className="mt-5 space-y-2">
          <h2 className="text-base font-semibold">
            Your conversation with Clarity will live here.
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Conversation isn’t connected in this build yet.
          </p>
        </div>
      </section>
    </div>
  );
}
