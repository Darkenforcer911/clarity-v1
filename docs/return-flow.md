# Production return flow

The future production sequence is:

1. `/today` detects the latest unresolved previous approved plan.
2. Clarity shows one Recap for that plan.
3. If at least one complete calendar day exists between that plan date and
   the current local date, Clarity shows **While you were away** once.
4. Clarity continues to Shape Today for the actual current local date.

Days without a plan do not produce mandatory Recap screens. Gap updates remain
a development-only React-state prototype until a persistence model is approved.
