const activeClarityTurns = new Map<string, Promise<unknown>>();

/**
 * Coalesces concurrent work for one persisted user message inside a server
 * process. Database response uniqueness remains the cross-process authority.
 */
export async function runClarityTurnSingleFlight<T>(
  userMessageId: string,
  operation: () => Promise<T>,
) {
  const existing = activeClarityTurns.get(userMessageId) as
    | Promise<T>
    | undefined;
  if (existing) return existing;

  const pending = operation();
  activeClarityTurns.set(userMessageId, pending);
  try {
    return await pending;
  } finally {
    if (activeClarityTurns.get(userMessageId) === pending) {
      activeClarityTurns.delete(userMessageId);
    }
  }
}
