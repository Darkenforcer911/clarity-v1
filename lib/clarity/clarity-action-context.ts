const actionContextKind = "action";
const dayContextKind = "day";
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const localDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/;

export type ClarityActionInvocation = {
  kind: "daily_action";
  actionId: string;
};

export type ClarityDayInvocation = {
  kind: "day";
  localDate: string;
};

export type ClarityInvocation =
  | ClarityActionInvocation
  | ClarityDayInvocation;

type SearchParams = Record<string, string | string[] | undefined>;

export function buildActionClarityHref(actionId: string) {
  const params = new URLSearchParams({
    context: actionContextKind,
    actionId,
  });

  return `/clarity?${params.toString()}`;
}

export function buildDayClarityHref(localDate: string) {
  const params = new URLSearchParams({
    context: dayContextKind,
    date: localDate,
  });

  return `/clarity?${params.toString()}`;
}

export function parseClarityInvocation(
  searchParams: SearchParams,
): ClarityInvocation | null {
  const context = firstValue(searchParams.context);

  if (context === actionContextKind) {
    const actionId = firstValue(searchParams.actionId);
    return actionId && uuidPattern.test(actionId)
      ? { kind: "daily_action", actionId }
      : null;
  }

  if (context === dayContextKind) {
    const localDate = firstValue(searchParams.date);
    return localDate && isValidLocalDate(localDate)
      ? { kind: "day", localDate }
      : null;
  }

  return null;
}

export function parseActionClarityInvocation(
  searchParams: SearchParams,
): ClarityActionInvocation | null {
  const invocation = parseClarityInvocation(searchParams);
  return invocation?.kind === "daily_action" ? invocation : null;
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isValidLocalDate(value: string) {
  const match = localDatePattern.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));

  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
}
