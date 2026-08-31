import type { RecurrencePrimaryChoice } from "./recurrence-ui";

// Legacy Daily Action recurrence is presentation metadata only. Canonical
// repeating behaviour belongs to a Routine, which materializes independent
// dated Daily Action occurrences at the Shape Today boundary.

const weekdayLabels = new Map([
  [1, "Mon"],
  [2, "Tue"],
  [3, "Wed"],
  [4, "Thu"],
  [5, "Fri"],
  [6, "Sat"],
  [0, "Sun"],
]);

export function formatActionRecurrenceSummary(
  pattern: string,
  selectedDays: readonly number[] = [],
) {
  if (pattern === "daily") return "Daily";
  if (pattern === "weekly") return "Weekly";
  if (pattern === "certain_days") {
    const labels = [...weekdayLabels]
      .filter(([day]) => selectedDays.includes(day))
      .map(([, label]) => label);
    return labels.length > 0 ? labels.join(", ") : "Custom";
  }
  return "Doesn't repeat";
}

export function getActionRecurrencePrimaryChoice(
  pattern: string,
): RecurrencePrimaryChoice {
  if (pattern === "daily" || pattern === "weekly") return pattern;
  if (pattern === "certain_days") return "custom";
  return "none";
}

export function resolveActionRecurrencePrimaryChoice(
  choice: RecurrencePrimaryChoice,
) {
  return choice === "custom" ? "certain_days" : choice;
}
