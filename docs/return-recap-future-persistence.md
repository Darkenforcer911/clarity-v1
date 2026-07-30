# Return recap: future persistence model

The AI-first return-flow prototype is intentionally local-only. Natural recap
text, interpretation confidence, clarification items, gap updates, and proposal
decisions are not currently written to Supabase.

A future persisted model should keep these concepts distinct:

- The approved daily plan remains the authoritative record of what the user
  committed to on that date.
- Confirmed action outcomes update those approved actions without creating
  replacement plans for missed dates.
- Unplanned historical activity records meaningful work that happened outside
  an approved plan.
- Changed context records blockers or circumstances and whether they still
  affect the current day.
- Commitments record deadlines or scheduled events that affect future planning.
- Occurrence time and recorded time remain separate so approximate historical
  recollection is not presented as a precise contemporaneous record.
- The original natural recap and the AI proposal may be retained as provenance,
  but neither should override the user-confirmed structured result.

Gap-day updates must never be converted into retroactive approved daily plans.
Any future schema and RPC work should preserve authenticated ownership, RLS,
atomic reconciliation, and an explicit distinction between proposed and
confirmed interpretation.
