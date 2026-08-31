const actionContextKind = "action";
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ClarityActionInvocation = {
  kind: "daily_action";
  actionId: string;
};

type SearchParams = Record<string, string | string[] | undefined>;

export function buildActionClarityHref(actionId: string) {
  const params = new URLSearchParams({
    context: actionContextKind,
    actionId,
  });

  return `/clarity?${params.toString()}`;
}

export function parseActionClarityInvocation(
  searchParams: SearchParams,
): ClarityActionInvocation | null {
  const context = firstValue(searchParams.context);
  const actionId = firstValue(searchParams.actionId);

  if (
    context !== actionContextKind ||
    !actionId ||
    !uuidPattern.test(actionId)
  ) {
    return null;
  }

  return { kind: "daily_action", actionId };
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
