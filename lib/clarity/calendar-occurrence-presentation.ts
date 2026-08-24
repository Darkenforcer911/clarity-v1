export function formatCalendarOutcomeLabel(outcome: string) {
  if (outcome === "attended") return "Completed";
  return outcome[0].toUpperCase() + outcome.slice(1);
}

export function formatCalendarOutcomeStatus(
  occurrence: {
    reconciliation_outcome?: string | null;
    completed_at?: string | null;
  },
  timezone: string,
) {
  const outcome = occurrence.reconciliation_outcome;
  if (!outcome) return null;

  const label = formatCalendarOutcomeLabel(outcome);
  if (outcome !== "attended" || !occurrence.completed_at) return label;

  const completedTime = new Intl.DateTimeFormat("en-AU", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(occurrence.completed_at));

  return `${label} · ${completedTime}`;
}
