# Clarity Intelligence Skeleton V1

Clarity is the only user-facing intelligence. Internal capabilities may
specialize, but they do not become separate personalities or user-visible
agents.

## Runtime shape

V1 defines one future `ClarityOrchestrator`. It uses the existing
`CLARITY_REASONING_POLICY`, requests only the context required for the current
situation, and returns a structured next move. There is no model provider or
orchestrator implementation in this skeleton.

Simple requests should eventually take one direct reasoning path. More
consequential requests may ask specialist capabilities for opportunity,
scenario, memory, research, planning, or Life synthesis results. Those results
return to Clarity; specialists do not speak to the user independently.

## Canonical context boundaries

- Life uses the existing `LifeModel` read model. It remains confirmed canonical
  truth rather than a transcript or inference store.
- Today uses the existing Daily Loop data and Action outcomes.
- Calendar uses canonical commitments, occurrences, historical outcomes, and
  day corrections.
- Return uses the authoritative return classifier and neutral return boundary.
- Conversation memory distinguishes raw messages, recent working context,
  episodes, decisions, evidence/outcomes, and compressed summaries.
- A user-reported statement remains `user_reported` unless it becomes confirmed
  canonical data, system-observed evidence, or an externally verified fact.

Onboarding, Shape Today, Catch Up, Life changes, weekly review, and Action
workspaces should eventually invoke this same orchestrator through their own
surface context. Their current behavior is unchanged.

## Shape Today and day-focus ownership

Clarity will eventually propose the day's focus and priority ordering during
Shape Today. That proposal may use Current Direction, the immediate bottleneck,
Calendar constraints, available capacity, Action duration, recent evidence and
outcomes, current profile-local time, and the user's accepted Shape Today plan.

The accepted plan remains authoritative. Clarity does not silently rewrite a
day's focus or reorder an accepted day after approval. A consequential revision
must be presented through an appropriate user interaction and confirmed before
deterministic application logic applies it.

## External-world boundary

Personal context and current-world facts are separate inputs. If a
consequential recommendation depends on changing information such as laws,
benefits, visas, tax, job markets, university rules, costs, or housing support,
Clarity must request verified external context rather than rely on model memory.
No research integration exists in V1.

## Authority boundary

The model reasons and proposes. Application code validates and enforces. The
user confirms consequential changes. Orchestrator output cannot directly write
canonical Life, Current Direction, major commitments, or important Calendar
state. Existing proposal and confirmation paths remain authoritative.

Hidden reasoning is neither returned by the contract nor persisted. Only a
concise user-facing response, structured next move, context request, and typed
mutation proposals cross the orchestrator boundary.

## Privacy and future aggregate learning

Context sources are always scoped to one authenticated user. Raw conversation,
Life, Calendar, Actions, and memories from one user must never be exposed as
retrievable context for another user.

Future aggregate learning may use separately consented and de-identified
`context → strategy → action → result` patterns. This skeleton defines no
cross-user store, global-learning table, or pipeline.

## Persistence deferred

The `/clarity` surface does not persist conversation. A future persistent
conversation will require a reviewed forward migration for an ownership-safe,
one-conversation-per-user record and append-only messages. Episodic or summary
memory persistence would require a separate design and migration. Neither is
part of this task.
