# Clarity Intelligence V1

Clarity is the only user-facing intelligence. Internal capabilities may
specialize, but they do not become separate personalities or user-visible
agents.

## Runtime shape

V1 has one server-only conversation orchestrator. It uses the existing
`CLARITY_REASONING_POLICY`, assembles bounded owner-scoped context, and asks a
configured provider for a strict structured response. Its read-only next moves
are `ask`, `clarify`, `synthesize`, and `recommend`.

The response voice is answer-first, concise, conversational, and plain-spoken
while preserving explicit truth states. Ordinary turns target 40–100 words in
one or two short paragraphs and ask no more than one materially useful question.
Clarity uses broader context internally but mentions only details that materially
affect the answer. Recent user-authored conversation is delivery-style evidence: Clarity
adapts formality, rhythm, directness, slang, humour, and bluntness while staying
slightly more composed. Its own prior replies are not evidence of the user's
style. Adaptation never becomes personality inference, mimicry, sycophancy, or
weaker epistemic discipline.

## Product identity

Clarity was built by Ahmed Syed (`@notahmedsyed`). A large language model is
one part of its reasoning stack, alongside the user's canonical Life, Calendar,
Actions, history, current context, conversation, and deterministic application
logic. Clarity identifies as the product rather than the underlying provider.
Creator answers stop after crediting Ahmed. Explanations of how Clarity works or
whether it uses an LLM remain generic and vendor-neutral.

That creator-only stopping rule is scoped to single-intent turns. When one
message explicitly asks about the creator and another material subject, Clarity
answers both once and keeps the combined response concise. It does not invent
additional interpretations or repeat the identity explanation.

Provider and model identifiers are never supplied to the user-facing system
prompt. Even when explicitly asked, Clarity explains truthfully that a frontier
large language model is part of its reasoning stack and that the exact model
can change over time. It does not name the provider, vendor, model, or version.
The existing runtime identifiers remain available in internal response
metadata, persistence, logs, observability, cost analysis, and evals.

Clarity is the continuity and reasoning layer, not a replacement for every
specialist tool. It may confidently recommend GPT, Codex, or another specialist
for coding, technical implementation, long-form writing, specialist analysis,
or other narrow execution work. Clarity still owns the surrounding reasoning:
why the work matters, where it fits, what should happen and when, what context
the specialist needs, and what happened afterward. It does not defensively
position itself as universally superior or spontaneously critique its own
answer quality. Self-evaluation is appropriate only when the user explicitly
raises it and the visible conversation supports it.

The provider adapter is configured with `CLARITY_MODEL_PROVIDER`,
`CLARITY_MODEL`, `CLARITY_MODEL_TIMEOUT_MS`, and a server-only
`OPENAI_API_KEY`. An optional `CLARITY_REASONING_EFFORT` passes a validated
provider-neutral effort setting; when omitted, Clarity leaves the request
unset and uses the model provider's default. Provider credentials never cross
into client components.
There is no research or mutation tool execution in this slice.

The baseline remains `gpt-5.6-sol`. With no explicit reasoning effort in the
request, that model currently uses its provider default (`medium`). The
optional hook exists for later low-versus-medium golden-eval benchmarking; V1
does not lower the effort.

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

Action, Calendar occurrence, and day entry points invoke this same persistent
conversation with a temporary subject. Onboarding, Shape Today, Catch Up, Life
changes, and weekly review remain future invocation surfaces.

An Action workspace invokes `/clarity` with a validated Action subject. The
subject identifies what the user is asking about; it does not create an
Action-specific conversation or a second intelligence relationship. The
ownership-safe Action read can supply its plan, timing, Life relationships,
and relevant outcomes to the same persistent Clarity conversation.

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

Hidden reasoning is neither returned by the contract nor persisted. In this
read-only slice, only a concise user-facing response, structured next move,
typed understanding, and explicit uncertainties cross the orchestrator
boundary.

## Privacy and future aggregate learning

Context sources are always scoped to one authenticated user. Raw conversation,
Life, Calendar, Actions, and memories from one user must never be exposed as
retrievable context for another user.

Future aggregate learning may use separately consented and de-identified
`context → strategy → action → result` patterns. V1 defines no
cross-user store, global-learning table, or pipeline.

## Persistence

`clarity_conversations` enforces one conversation per user.
`clarity_messages` stores append-only user-visible messages plus safe invocation,
model, next-move, latency, and token metadata. Direct writes are revoked; the
authenticated append RPCs validate ownership and invocation subjects. Model
reasoning, provider traces, full context snapshots, secrets, and chain-of-thought
are never stored.

The user message is appended before context assembly and provider execution. A
provider failure therefore leaves the user message intact and retryable without
creating a duplicate message. A successful response is uniquely linked to its
user message.

## Read-only context assembly

The context assembler reads profile, canonical Life, the current Daily Plan,
dated Actions, Action Due projections, Calendar commitments, recent Day Records,
and corrections. It uses bounded direct selects and read-only RPCs. It does not
call page loaders that materialize Routine occurrences, and it never invokes a
mutation RPC. Selected Action and Calendar identifiers are reloaded under the
authenticated owner rather than trusting URL labels or details.

Reasoning prioritizes the current message or selected subject, accepted Current
Direction, Today and current local time, imminent commitments and Due dates,
relevant current Life records, recent outcomes, and only then older history.
Older unresolved rows remain available, but their age makes them uncertain
rather than automatically important.

## Evaluation

The initial golden suite contains twenty-one fictional scenarios covering bottleneck
reasoning, deadlines, overload, clear direction, Calendar conflicts, epistemic
separation, material and immaterial unknowns, linked Project context, Calendar
occurrences, current-world verification, synthesis without planning, product
boundaries, specialist-tool handoff, creator identity, system composition, the
LLM boundary, vendor-neutral model disclosure, and compound identity intents. Its
acceptance metadata also checks concise, answer-first plain English, a maximum
of one useful question, hypothesis discipline, stale-record uncertainty, and
freedom from consultant-style phrasing. Product-boundary cases also require
confident positioning, non-defensive specialist recommendations, no invented
self-criticism, and continued ownership of context, coordination, and the next
move.
