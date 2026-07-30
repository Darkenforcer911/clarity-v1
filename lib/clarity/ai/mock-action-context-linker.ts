import type {
  ActionContextLinkInput,
  ActionContextLinkResult,
  ActionContextLinker,
} from "./action-context-linker";

const fixedRelationships = [
  {
    pattern: /\b(?:cv|résumé|resume|job search|job application|interview)\b/i,
    label: "Job search",
    kind: "project" as const,
  },
  {
    pattern: /\bclarity(?:\s+pwa|\s+app|\s+screen|\s+project)?\b/i,
    label: "Clarity",
    kind: "project" as const,
  },
  {
    pattern:
      /\b(?:family|sister|brother|mum|mom|mother|dad|father|parent|daughter|son)\b/i,
    label: "Family",
    kind: "area" as const,
  },
];

const trivialOneOffPattern =
  /\b(?:buy|pick up|make food|cook|meal|grocer|milk|call|email|appointment|errand|gym|workout|laundry)\b/i;

const ongoingPattern =
  /\b(?:build|develop|launch|redesign|renovate|portfolio|business|course|thesis|project|campaign|website|app)\b/i;

export class MockActionContextLinker implements ActionContextLinker {
  async link(
    input: ActionContextLinkInput,
  ): Promise<ActionContextLinkResult> {
    const searchable = `${input.title} ${input.context}`.trim();
    const fixed = fixedRelationships.find(({ pattern }) =>
      pattern.test(searchable),
    );

    if (fixed) {
      return {
        relationship: { label: fixed.label, kind: fixed.kind },
        ongoingSuggestion: null,
      };
    }

    const remembered = input.rememberedContexts.find((label) =>
      contextMatches(searchable, label),
    );

    if (remembered) {
      return {
        relationship: { label: remembered, kind: "project" },
        ongoingSuggestion: null,
      };
    }

    if (
      input.recurrencePattern !== "none" ||
      trivialOneOffPattern.test(searchable) ||
      !ongoingPattern.test(searchable)
    ) {
      return { relationship: null, ongoingSuggestion: null };
    }

    return {
      relationship: null,
      ongoingSuggestion: deriveContextName(input.title),
    };
  }
}

function contextMatches(value: string, label: string) {
  const normalizedValue = normalize(value);
  const meaningfulWords = normalize(label)
    .split(" ")
    .filter((word) => word.length >= 4);

  return (
    meaningfulWords.length > 0 &&
    meaningfulWords.every((word) => normalizedValue.includes(word))
  );
}

function deriveContextName(title: string) {
  const candidate = title
    .replace(
      /^(?:work\s+on|continue|build|develop|launch|redesign|update|finish)\s+/i,
      "",
    )
    .replace(/[.!?]+$/g, "")
    .trim();

  if (!candidate || candidate.length > 80) {
    return null;
  }

  return candidate.charAt(0).toUpperCase() + candidate.slice(1);
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
