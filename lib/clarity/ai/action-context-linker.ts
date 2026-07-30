export type ActionContextRelationship = {
  label: string;
  kind: "project" | "area";
};

export type ActionContextLinkInput = {
  title: string;
  context: string;
  recurrencePattern: "none" | "daily" | "weekly" | "certain_days";
  rememberedContexts: string[];
};

export type ActionContextLinkResult = {
  relationship: ActionContextRelationship | null;
  ongoingSuggestion: string | null;
};

export interface ActionContextLinker {
  link(input: ActionContextLinkInput): Promise<ActionContextLinkResult>;
}
