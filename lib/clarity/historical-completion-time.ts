const localTimePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

export function initialHistoricalCompletionTime({
  completed,
  existingCompletionTime,
}: {
  completed: boolean;
  existingCompletionTime: string | null | undefined;
}) {
  if (!completed || !existingCompletionTime) return "";
  return localTimePattern.test(existingCompletionTime)
    ? existingCompletionTime
    : "";
}

export function submittedHistoricalCompletionTime({
  completed,
  selectedCompletionTime,
}: {
  completed: boolean;
  selectedCompletionTime: string;
}) {
  if (!completed || !selectedCompletionTime) return null;
  return localTimePattern.test(selectedCompletionTime)
    ? selectedCompletionTime
    : null;
}
