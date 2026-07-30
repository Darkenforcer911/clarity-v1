export const developmentRecapActions = [
  {
    id: "active-approved",
    title: "Call Mum",
    status: "active",
    approved_at: "2026-07-28T08:00:00.000Z",
    resolution_note: null,
  },
  {
    id: "completed-approved",
    title: "Buy milk",
    status: "completed",
    approved_at: "2026-07-28T08:00:00.000Z",
    resolution_note: null,
  },
  {
    id: "added-during-active-day",
    title: "Pick up my sister",
    status: "active",
    approved_at: "2026-07-28T12:00:00.000Z",
    resolution_note: null,
  },
  {
    id: "removed-from-today",
    title: "Research roles",
    status: "dropped",
    approved_at: "2026-07-28T08:00:00.000Z",
    resolution_note: "Removed from today",
  },
  {
    id: "replaced-original",
    title: "Make food",
    status: "removed",
    approved_at: "2026-07-28T08:00:00.000Z",
    resolution_note:
      "Replaced by action 11111111-1111-4111-8111-111111111111",
  },
  {
    id: "replacement-that-remained",
    title: "Leave house",
    status: "active",
    approved_at: "2026-07-28T14:00:00.000Z",
    resolution_note: null,
  },
  {
    id: "removed-proposed-draft",
    title: "Dismissed draft",
    status: "removed",
    approved_at: null,
    resolution_note: null,
  },
] as const;

export const expectedRecapActionIds = [
  "active-approved",
  "completed-approved",
  "added-during-active-day",
  "replacement-that-remained",
] as const;
