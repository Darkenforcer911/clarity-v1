"use client";

import { MessageCircle, Send } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";

import {
  applyClarityChangeAction,
  askClarityAction,
} from "@/app/(app)/today/action-workspace-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionAssistantMessage } from "@/lib/clarity/daily-loop-queries";
import { initialDailyLoopActionState } from "@/lib/clarity/action-state";
import { formatDuration } from "@/lib/clarity/duration";
import { parseTaskAssistantContent } from "@/lib/clarity/ai/task-assistant";
import type { TaskRevisionProposal } from "@/lib/clarity/ai/task-assistant";
import { PendingButton } from "./pending-button";

const quickQuestions = [
  "What should I do first?",
  "I’m stuck",
  "What tool should I use?",
];

export function AskClarityPanel({
  actionId,
  messages,
  open,
  onToggle,
  timezone,
  onChangeApplied,
}: {
  actionId: string;
  messages: ActionAssistantMessage[];
  open: boolean;
  onToggle: () => void;
  timezone: string;
  onChangeApplied: () => void;
}) {
  const [question, setQuestion] = useState("");
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [state, formAction] = useActionState(
    askClarityAction,
    initialDailyLoopActionState,
  );

  return (
    <section className="space-y-3">
      <Button
        type="button"
        variant="outline"
        size="lg"
        onClick={onToggle}
        aria-expanded={open}
        className="h-12 w-full rounded-xl text-base"
      >
        <MessageCircle className="size-5 text-primary" />
        Ask Clarity
      </Button>
      {open && (
        <div className="space-y-5 rounded-2xl bg-card p-5">
          {messages.length > 0 && (
            <div className="space-y-3" aria-live="polite">
              {messages.map((message) => {
                const parsed = parseTaskAssistantContent(message.content);
                const showProposal =
                  message.role === "assistant" &&
                  parsed.proposal &&
                  !dismissed.includes(message.id);

                return (
                  <div
                    key={message.id}
                    className={`rounded-xl px-4 py-3 text-sm leading-6 ${
                      message.role === "assistant"
                        ? "border border-[var(--clarity-completed)] bg-secondary"
                        : "ml-6 bg-primary text-primary-foreground"
                    }`}
                  >
                    <p className="mb-1 text-xs font-semibold">
                      {message.role === "assistant" ? "Clarity" : "You"}
                    </p>
                    <p className="whitespace-pre-wrap">{parsed.content}</p>
                    {showProposal && parsed.proposal && (
                      <RevisionCard
                        actionId={actionId}
                        messageId={message.id}
                        proposal={parsed.proposal}
                        timezone={timezone}
                        onCancel={() =>
                          setDismissed((current) => [
                            ...current,
                            message.id,
                          ])
                        }
                        onApplied={onChangeApplied}
                      />
                    )}
                    {message.role === "assistant" && parsed.handoff && (
                      <div className="mt-4 rounded-xl bg-card p-4 text-foreground">
                        <Button
                          type="button"
                          variant="outline"
                          disabled
                          className="h-10 w-full rounded-xl"
                        >
                          Continue with Clarity
                        </Button>
                        <p className="mt-2 text-center text-xs text-muted-foreground">
                          A broader Clarity conversation is coming later.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {quickQuestions.map((prompt) => (
              <Button
                key={prompt}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setQuestion(prompt)}
                className="h-auto min-h-9 whitespace-normal rounded-full px-3 py-2 text-left"
              >
                {prompt}
              </Button>
            ))}
          </div>

          <form action={formAction} className="space-y-3">
            <input type="hidden" name="actionId" value={actionId} />
            <Input
              name="question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask about this action…"
              maxLength={2000}
              required
              className="h-12 rounded-xl"
            />
            {state.fieldErrors?.question?.[0] && (
              <p className="text-sm text-[var(--clarity-completed)]">
                {state.fieldErrors.question[0]}
              </p>
            )}
            {state.error && (
              <p
                role="alert"
                className="rounded-xl border border-border bg-secondary px-4 py-3 text-sm"
              >
                {state.error}
              </p>
            )}
            {state.success && (
              <p className="text-sm text-[var(--clarity-completed)]">
                {state.success}
              </p>
            )}
            <PendingButton
              type="submit"
              variant="outline"
              pendingLabel="Clarity is responding…"
              className="h-11 w-full rounded-xl"
            >
              <Send />
              Ask about this action
            </PendingButton>
          </form>
        </div>
      )}
    </section>
  );
}

function RevisionCard({
  actionId,
  messageId,
  proposal,
  timezone,
  onCancel,
  onApplied,
}: {
  actionId: string;
  messageId: string;
  proposal: TaskRevisionProposal;
  timezone: string;
  onCancel: () => void;
  onApplied: () => void;
}) {
  const [state, formAction] = useActionState(
    applyClarityChangeAction,
    initialDailyLoopActionState,
  );
  const handledSuccess = useRef(false);

  useEffect(() => {
    if (state.success && !handledSuccess.current) {
      handledSuccess.current = true;
      onApplied();
      onCancel();
    }
  }, [onApplied, onCancel, state.success]);

  const replacement = proposal.operation === "replace";

  return (
    <div className="mt-4 rounded-xl bg-card p-4 text-foreground">
      <p className="font-semibold text-[var(--clarity-completed)]">
        Clarity suggests
      </p>
      <p className="mt-1">
        {replacement
          ? proposal.summary.replace(/\.$/, "?")
          : proposal.summary}
      </p>

      <dl className="mt-4 space-y-3 text-sm">
        <RevisionDetail label="Action" value={proposal.action.title} />
        <RevisionDetail
          label="Duration"
          value={formatDuration(proposal.action.estimatedMinutes)}
        />
        <RevisionDetail
          label="Timing"
          value={revisionTiming(proposal, timezone)}
        />
        <RevisionDetail
          label="Done when"
          value={proposal.action.definitionOfDone}
        />
        <RevisionDetail
          label="Best approach"
          value={proposal.action.suggestedMethod}
        />
        {isUsefulWhy(proposal.action.whyItExists) && (
          <RevisionDetail
            label="Why it matters"
            value={proposal.action.whyItExists}
          />
        )}
      </dl>

      {state.error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {state.error}
        </p>
      )}

      <div className="mt-4 grid gap-2">
        <form action={formAction}>
          <input type="hidden" name="actionId" value={actionId} />
          <input type="hidden" name="messageId" value={messageId} />
          <PendingButton
            type="submit"
            pendingLabel="Applying…"
            className="h-10 w-full rounded-xl"
          >
            {replacement ? "Replace action" : "Apply change"}
          </PendingButton>
        </form>
        {replacement && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            className="h-10 rounded-xl"
          >
            Keep original
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          className="h-10 rounded-xl"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

function RevisionDetail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-semibold">{label}</dt>
      <dd className="mt-0.5 text-muted-foreground">{value}</dd>
    </div>
  );
}

function revisionTiming(
  proposal: TaskRevisionProposal,
  timezone: string,
) {
  if (proposal.operation === "move_tomorrow") return "Tomorrow";
  if (proposal.operation === "drop") return "Remove from today";
  if (
    proposal.action.actionType === "fixed" &&
    proposal.action.scheduledTime
  ) {
    return new Intl.DateTimeFormat("en-AU", {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(proposal.action.scheduledTime));
  }
  return "Anytime today";
}

function isUsefulWhy(value: string) {
  const normalized = value.trim().toLowerCase();
  return !(
    normalized.startsWith("supports today") ||
    normalized.includes("moves the plan forward") ||
    normalized === "added because it matters today."
  );
}
