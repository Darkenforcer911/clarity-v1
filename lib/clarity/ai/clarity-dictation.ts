export type ClarityDictationStatus =
  | "idle"
  | "recording"
  | "paused"
  | "transcribing"
  | "transcript_ready"
  | "failed";

export function appendDictationTranscript(
  existingText: string,
  transcript: string,
) {
  const existing = existingText.trimEnd();
  const addition = transcript.trim();

  if (!addition) return existingText;
  if (!existing) return addition;
  return `${existing} ${addition}`;
}
