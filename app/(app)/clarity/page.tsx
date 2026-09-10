import { redirect } from "next/navigation";
import { Suspense } from "react";

import { ClarityConversation } from "@/components/clarity/clarity-conversation";
import { PageLoading } from "@/components/clarity/page-loading";
import {
  ClarityInvocationNotFoundError,
  invocationDescriptor,
  resolveClarityInvocationSubject,
} from "@/lib/clarity/ai/clarity-context-assembler";
import { loadClarityConversation } from "@/lib/clarity/ai/clarity-conversation-service";
import { parseClarityInvocation } from "@/lib/clarity/clarity-action-context";
import { AuthenticationRequiredError } from "@/lib/clarity/daily-loop-queries";

type ClarityPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function ClarityPage({ searchParams }: ClarityPageProps) {
  return (
    <Suspense fallback={<PageLoading />}>
      <ClarityContent searchParams={searchParams} />
    </Suspense>
  );
}

async function ClarityContent({ searchParams }: ClarityPageProps) {
  const resolvedSearchParams = await searchParams;
  const invocation = parseClarityInvocation(resolvedSearchParams);
  const layoutDebugValue = resolvedSearchParams.layoutDebug;
  const layoutDebug = Array.isArray(layoutDebugValue)
    ? layoutDebugValue.includes("1")
    : layoutDebugValue === "1";
  const { conversation, subject } = await loadClarityPageData(invocation);

  return (
    <div
      data-clarity-conversation-route
      className="flex min-h-0 flex-1 flex-col gap-5"
      data-slot="clarity-conversation"
    >
      <header className="shrink-0 space-y-2">
        <h1
          data-clarity-page-title
          className="text-3xl font-semibold tracking-[-0.04em]"
        >
          Clarity
        </h1>
        <p
          data-clarity-page-intro
          className="max-w-sm text-sm leading-6 text-muted-foreground"
        >
          Think through what matters, explore your options, and work out what
          to do next.
        </p>
      </header>

      <ClarityConversation
        messages={conversation.messages}
        invocation={invocationDescriptor(invocation)}
        subjectLabel={subject?.label ?? null}
        layoutDebug={layoutDebug}
      />
    </div>
  );
}

async function loadClarityPageData(
  invocation: ReturnType<typeof parseClarityInvocation>,
) {
  try {
    const [conversation, subject] = await Promise.all([
      loadClarityConversation(),
      resolveClarityInvocationSubject(invocation),
    ]);
    return { conversation, subject };
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) redirect("/auth/login");
    if (error instanceof ClarityInvocationNotFoundError) redirect("/clarity");
    throw error;
  }
}
