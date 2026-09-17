# Intelligent Onboarding V1

`/onboarding` is Clarity's First Understanding conversation. It is directly
accessible to an authenticated user and is not a global product redirect.

## Runtime

The onboarding orchestrator reuses the configured Clarity model provider and
its bounded structured-output repair path. Each user answer is persisted before
provider work. The response contract returns:

- one user-visible assistant message and one internal response mode;
- a complete cumulative understanding of current reality, desired future,
  assets, constraints, behavioral evidence, pressure, and possible routes;
- qualitative progress, material unknowns, grounded insights, and at most four
  route families;
- readiness and, only when ready, the full reviewed synthesis and derived time
  horizons.

Claims are classified as `fact`, `inference`, or `unknown`. Facts, inferences,
insights, and routes may cite only user message IDs from the owned onboarding
session. No hidden reasoning is requested or stored.

Question selection is adaptive: Clarity asks only the single question most
likely to change the synthesis, route, bottleneck, or next move. It does not
walk empty fields. Synthesis normally requires three meaningful user turns; a
single unusually rich answer can qualify. Ten to twelve assistant questions is
a soft ceiling, after which explicit unknowns are preferable to a longer
interview.

The V1 base reasoning policy is frozen around one adaptive loop:
`DISCOVER → GROUND → LOCATE → COMPARE → DEEPEN → PRIORITISE → ACT`. It grounds
material ambiguity before inference, maps enough breadth to avoid tunnel
vision, earns depth through expected decision impact, and keeps facts,
inferences, and unknowns distinct. Domain examples belong in evaluation
fixtures rather than production rules. Before beta, base reasoning should be
reopened only for a demonstrated violation of one of these invariants;
reliability defects and product-learning observations are tracked separately.

## Authority and persistence

`onboarding_messages` is an append-only, owner-scoped workflow transcript.
`onboarding_sessions` stores the latest structured understanding, qualitative
progress, synthesis, and a confirmed snapshot. Authenticated clients receive
read access only; three `SECURITY DEFINER` RPCs perform owned writes with an
empty `search_path`.

Confirmation freezes the reviewed snapshot and marks onboarding complete. V1
does not turn inferred understanding into Life Areas, Goals, Projects,
Routines, Actions, Calendar records, or Current Direction. Those later
promotions still require a separate proposal and confirmation boundary.
