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
The only tool execution in this slice is bounded provider-native web research
when the initial structured turn identifies a material current-world
dependency. Canonical mutation tools remain unavailable.

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
Clarity must verify current evidence rather than rely on model memory.

Research uses a bounded two-stage path. The first normal structured turn sets
`requiresCurrentVerification` and a precise `verificationNeed`. When true, the
orchestrator performs a second response with provider-native web search forced,
up to four tool calls, and asks for the final Clarity synthesis. The preliminary
answer is not persisted and is rendered only as the safe fallback if that
research request fails. Stable knowledge and ordinary personal execution
questions stay on the existing one-pass path.

Each research stage makes one provider request. There is no application retry
loop, polling, timed retry, or refresh-triggered retry. If research fails, the
safe part of the preliminary reasoning is shown with a short disclosure that
current information was not verified. The original user message remains the
single persisted input and a compact `Retry research` action reruns only the
research/final-synthesis stage. It does not append the user message, re-upload
attachments, or rerun successful dictation. Concurrent attempts for the same
persisted message are coalesced within one server process, the retry control is
disabled in flight, and the existing unique response relationship remains the
cross-process persistence authority.

Fallback reasoning never fills current-world gaps from model memory. When
turning known context into a plan or recommendation, Clarity also preserves
consequential confirmed details such as dependencies, deadlines, transport,
commitments involving other people, and attached execution instructions. It
does not invent constraints that are missing or uncertain.

The research prompt prioritizes official central banks, governments,
regulators, company announcements, and filings where appropriate. Breaking
news may require multiple credible current sources. Verified facts remain
distinct from forecasts, inferences, disputed causal claims, and Clarity's own
judgment. Relevant profile location and personal context inform the synthesis;
the result must answer the user's decision rather than merely summarize search
results.

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
model, next-move, latency, token, and research metadata. Research metadata uses
the existing `structured_metadata` JSON object and contains only sanitized
source title, URL, domain, optional publication date, retrieval time, source and
tool-call counts, and research latency. Direct writes are revoked; the
authenticated append RPCs validate ownership and invocation subjects. Model
reasoning, provider traces, full context snapshots, secrets, and chain-of-thought
are never stored.

The user message is appended before context assembly and provider execution. A
provider or research failure therefore leaves the user message intact and
retryable without creating a duplicate message. A successful response is
uniquely linked to its user message. Researched responses render their persisted
sources in a compact disclosure after refresh or conversation reload.

## Multimodal conversation boundary

Photos attach to the same persistent Clarity conversation and user-message
record; they do not create media-specific chats. The composer accepts up to three
JPEG, PNG, WebP, or GIF images of at most 15 MB each. HEIC/HEIF selected on a
supported iPhone is decoded locally, orientation-preserved, bounded to a
4096-pixel long edge, and normalized to JPEG before validation and upload.
Microphone input is composer dictation: one recording of at most 15 MB and five
minutes is uploaded as a temporary owned draft, transcribed into editable
composer text, then removed.
Stopping dictation never sends a message. Photo and final edited text are sent
together only through the ordinary Send action. A failed transcription keeps
the draft available for Retry or Cancel without fabricating text or persisting
a conversation message. Legacy audio messages remain readable and retryable.

Media bytes live in the private `clarity-media` storage bucket under the
authenticated user's folder. The owner-scoped `clarity_message_attachments`
table stores only bounded metadata, message association, transcription state,
and transcript text. Conversation reads create short-lived signed URLs for
legacy playback. Raw media, base64 image data, signed URLs, and audio are
never stored in message content or structured metadata, and logs contain no
media or transcripts.

Clarity currently has no persisted-message, conversation-history, profile, or
account deletion workflow. Draft attachment removal deletes the private object
through the Storage API before removing its unattached metadata row. If account
or persisted-message deletion is introduced later, its trusted server workflow
must delete owned Storage objects through the Storage API before database
metadata is deleted or cascaded. SQL triggers must not mutate `storage.objects`
directly.

Only media attached to the current user turn is sent to the model. Historical
photos are represented in bounded history only as the fact that an image was
sent; historical audio uses its transcript. Media and transcripts remain
conversation evidence and never become canonical Life truth without the
existing explicit proposal and confirmation boundary.

## Research response presentation

Clarity persists research source data separately from answer prose. Source URLs
are normalized and deduplicated before storage. User-visible prose strips raw
URLs and literal Markdown decoration, while paragraph breaks remain intact.
The conversation renders a compact collapsed Sources disclosure with a ranked,
publisher-diverse initial list and an explicit View all control for genuinely
useful additional sources. Publisher labels replace recognizable raw hostnames.
Refreshing the conversation
reconstructs this presentation from stored safe metadata rather than from raw
provider output.

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

The golden suite contains fictional scenarios covering bottleneck
reasoning, deadlines, overload, clear direction, Calendar conflicts, epistemic
separation, material and immaterial unknowns, linked Project context, Calendar
occurrences, current-world verification, synthesis without planning, product
boundaries, specialist-tool handoff, creator identity, system composition, the
LLM boundary, vendor-neutral model disclosure, compound identity intents,
explicit current events, implicit researched decisions, official-source
priority, disputed causality, conflicting forecasts, and deliberate no-research
turns. Its
acceptance metadata also checks concise, answer-first plain English, a maximum
of one useful question, hypothesis discipline, stale-record uncertainty, and
freedom from consultant-style phrasing. Product-boundary cases also require
confident positioning, non-defensive specialist recommendations, no invented
self-criticism, and continued ownership of context, coordination, and the next
move.
