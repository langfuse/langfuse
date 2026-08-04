# Remaining visible differences vs the v5 mock (1600×900, turn 1 + inspector)

Tags: **[data-rule]** = no fabricated data; **[kept-element]** = product
element the mock omits, kept per restyle-never-remove and restyled to blend;
**[F37-font]** = commercial display font not licensed; **[genuine-miss]** =
an honest miss / not yet matched.

## Inspector

1. **[kept-element]** Title row shows the playground split-button, the
   annotation-queue chevron and the kebab next to "+ Add to" — the mock has
   only "+ Add to".
2. **[kept-element]** A "Formatted | JSON" view-toggle row sits between the
   overview grid and INPUT; the mock has no view toggle. (It is the escape
   hatch to the full JSON/corrections machinery.)
3. **[kept-element]** Overview grid carries extra real metrics after the
   mock's six (TTFT, SESSION, TEMPERATURE, VERSION), and the model/tokens/
   cost values keep their ⓘ/⊕ affordances.
4. **[data-rule]** "System prompt" row shows no "412 tok" count — we have no
   per-message token datum, so none is shown.
5. **[kept-element]** A METADATA accordion renders below SCORES (not in the
   mock); Correct shows an amber "has correction" dot when one exists.
6. **[genuine-miss]** SCORES empty copy is "No scores on this span yet."
   without the mock's "Session-level `session-quality: 0.49` comes from the
   nightly eval run." — the session-level score isn't plumbed into the shared
   accordion yet (the value itself would be real).
7. **[genuine-miss]** The ✕ close affordance is smaller than the mock's
   28px hover square with an 18px glyph.
8. **[data-rule]** Band timestamp / latency / tokens / cost values differ
   from the mock's (real seeded data).

## Transcript

9. **[data-rule]** No "Tool call `lookup_order`" rows and no "+2 hrs idle"
   band variety — the seeded session has no TOOL spans and uniform ~6-min
   gaps. The tool-row/idle-band styling exists and matches the mock's specs.
10. **[genuine-miss]** User-bubble text uses the app foreground (near-black)
    vs the mock's softer #3d3d38 secondary ink.

## Rail

11. **[kept-element]** "16 spans" counter in the rail header, the « collapse
    button beside the funnel, and the hover-revealed open-trace ↗ icon on
    turn rows — none exist in the mock.
12. **[data-rule]** Percentile labels (p44/p6/p94…) computed from the real
    latencies; the mock's differ. Amber marks ≥p90 as in the mock.

## Header / top bar / nav

13. **[kept-element]** Breadcrumb keeps the org "Team" badge and dropdown
    chevrons; the Assistant button keeps its product styling (mock:
    plain `Seed Org / llm-app / Sessions` + secondary Assistant ⌘I).
14. **[kept-element]** Prev/next-session buttons (mock's K/J pair) come from
    DetailPageNav and only render when a sessions list context exists — they
    are absent on a cold deep link (this capture).
15. **[F37-font]** Page title, "langfuse" wordmark and other display text use
    the sans stack — F37 Analog needs Trang's license/files. (The mock's own
    static captures show the same fallback.)
16. **[kept-element]** Sidenav keeps the Star-Langfuse card, the
    "Fast (Preview)" toggle and the GitHub-stars chip; icons are the app's
    lucide set, slightly different strokes than the mock's custom set.
17. **[genuine-miss]** The chips row keeps an extra leading
    "8 traces · 16 spans" chip and the right-aligned "generations
    All/First/Last" control (kept-element), and chip heights are 22px vs the
    mock's 21px.

## Amber semantics (explicit)

18. **[data-rule]** The session-quality chip's amber dot means "fractional
    numeric score" — NOT "below 0.7 target" as the mock's tooltip implies.
    No score-target datum exists in the product, so the mock's semantics
    cannot be honestly reproduced.
