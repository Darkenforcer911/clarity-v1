"use client";

import { LoaderCircle, Send, X } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { sendClarityMessageAction } from "@/app/(app)/clarity/actions";
import { initialClarityConversationActionState } from "@/lib/clarity/ai/clarity-conversation-action-state";
import type { ClarityConversationMessage } from "@/lib/clarity/ai/clarity-conversation-service";
import type { ClarityInvocationDescriptor } from "@/lib/clarity/ai/clarity-context-assembler";
import { PendingButton } from "./pending-button";

type ComposerAttachment = {
  invocation: ClarityInvocationDescriptor;
  label: string;
};

const GENERAL_INVOCATION: ClarityInvocationDescriptor = {
  type: "general",
  actionId: null,
  calendarCommitmentId: null,
  localDate: null,
};

export function ClarityConversation({
  messages,
  invocation,
  subjectLabel,
}: {
  messages: ClarityConversationMessage[];
  invocation: ClarityInvocationDescriptor;
  subjectLabel: string | null;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(
    sendClarityMessageAction,
    initialClarityConversationActionState,
  );
  const lastCompletedAt = useRef<number | undefined>(undefined);
  const composerRef = useRef<HTMLFormElement>(null);
  const incomingAttachmentKey = attachmentKey(invocation, subjectLabel);
  const [attachment, setAttachment] = useState<ComposerAttachment | null>(() =>
    createAttachment(invocation, subjectLabel),
  );
  const previousIncomingAttachmentKey = useRef(incomingAttachmentKey);

  useEffect(() => {
    if (incomingAttachmentKey === previousIncomingAttachmentKey.current) return;
    previousIncomingAttachmentKey.current = incomingAttachmentKey;
    setAttachment(createAttachment(invocation, subjectLabel));
  }, [incomingAttachmentKey, invocation, subjectLabel]);

  useEffect(() => {
    if (!state.completedAt || state.completedAt === lastCompletedAt.current) return;
    lastCompletedAt.current = state.completedAt;
    if (state.success) {
      composerRef.current?.reset();
      if (attachment) {
        router.replace("/clarity", { scroll: false });
        return;
      }
    }
    router.refresh();
  }, [attachment, router, state.completedAt, state.success]);

  function removeAttachment() {
    setAttachment(null);
    router.replace("/clarity", { scroll: false });
  }

  return (
    <div className="flex min-h-[calc(100dvh-13rem)] flex-col gap-4">
      <div className="flex-1 space-y-3" aria-live="polite">
        {messages.length === 0 && (
          <p className="max-w-sm text-sm leading-6 text-muted-foreground">
            Tell me what’s on your mind. I’ll use what Clarity already knows
            to help you work out what matters next.
          </p>
        )}
        {messages.map((item) => (
          <article
            key={item.id}
            className={
              item.role === "user"
                ? "ml-auto max-w-[88%] rounded-2xl rounded-br-md bg-primary px-4 py-3 text-sm leading-6 text-primary-foreground"
                : "max-w-[94%] rounded-2xl rounded-bl-md bg-card px-4 py-3 text-sm leading-6 text-foreground"
            }
          >
            <p className="mb-1 text-xs font-semibold opacity-70">
              {item.role === "user" ? "You" : "Clarity"}
            </p>
            <p className="whitespace-pre-wrap">{item.content}</p>
          </article>
        ))}
      </div>

      <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] space-y-2 bg-background/95 pt-2 backdrop-blur">
        {(state.error || state.fieldError) && (
          <div role="alert" className="rounded-xl border border-border bg-secondary px-3 py-2 text-sm">
            <p>{state.fieldError ?? state.error}</p>
            {state.retryMessageId && (
              <form action={formAction} className="mt-2">
                <input type="hidden" name="retryMessageId" value={state.retryMessageId} />
                <PendingButton
                  type="submit"
                  variant="outline"
                  pendingLabel="Retrying…"
                  className="h-9 rounded-lg"
                >
                  Retry
                </PendingButton>
              </form>
            )}
          </div>
        )}

        <form
          ref={composerRef}
          action={formAction}
          noValidate
          className="flex min-w-0 items-end gap-2 rounded-2xl border border-border bg-card p-2 shadow-sm"
        >
          <InvocationFields invocation={attachment?.invocation ?? GENERAL_INVOCATION} />
          <div className="min-w-0 flex-1">
            {attachment && (
              <button
                type="button"
                onClick={removeAttachment}
                aria-label={`Remove ${attachment.label} context`}
                className="mx-2 mb-1 inline-flex max-w-[calc(100%-1rem)] items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-1 text-xs text-muted-foreground"
              >
                <span className="truncate font-medium text-foreground">
                  {attachment.label}
                </span>
                <X className="size-3.5 shrink-0" aria-hidden="true" />
              </button>
            )}
            <label className="block min-w-0">
              <span className="sr-only">Message Clarity</span>
              <textarea
                name="message"
                placeholder="Message Clarity…"
                rows={1}
                maxLength={8000}
                className="block max-h-32 min-h-11 w-full min-w-0 resize-none bg-transparent px-2 py-2.5 text-base leading-6 outline-none placeholder:text-muted-foreground"
              />
            </label>
          </div>
          <PendingButton
            type="submit"
            size="icon"
            pendingLabel={
              <LoaderCircle className="size-4 animate-spin" aria-label="Sending" />
            }
            aria-label="Send message"
            className="size-11 shrink-0 rounded-xl"
          >
            <Send />
          </PendingButton>
        </form>
      </div>
    </div>
  );
}

function createAttachment(
  invocation: ClarityInvocationDescriptor,
  subjectLabel: string | null,
): ComposerAttachment | null {
  return invocation.type !== "general" && subjectLabel
    ? { invocation, label: subjectLabel }
    : null;
}

function attachmentKey(
  invocation: ClarityInvocationDescriptor,
  subjectLabel: string | null,
) {
  return [
    invocation.type,
    invocation.actionId,
    invocation.calendarCommitmentId,
    invocation.localDate,
    subjectLabel,
  ].join(":");
}

function InvocationFields({
  invocation,
}: {
  invocation: ClarityInvocationDescriptor;
}) {
  return (
    <>
      <input type="hidden" name="invocationType" value={invocation.type} />
      <input type="hidden" name="actionId" value={invocation.actionId ?? ""} />
      <input
        type="hidden"
        name="calendarCommitmentId"
        value={invocation.calendarCommitmentId ?? ""}
      />
      <input type="hidden" name="localDate" value={invocation.localDate ?? ""} />
    </>
  );
}
