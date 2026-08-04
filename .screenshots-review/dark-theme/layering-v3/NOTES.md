# Layering v3 — @claude review round 1 fixes (PR #15116)

Straggler surfaces the token retune left painting darker-inside-lighter
(found by review round 1, fixed in 939b218ed).

Unlike v1/v2, "before" here = THE PR BEFORE THE FIX (4f47155a7, the
regression state the review caught), not main — the pairs demonstrate
the fix, both shot on the PR branch (no design-tuning changes mixed in).

| Pair | Surface | Fix |
|---|---|---|
| 1/2-peek | peek panel header | bg-header (2%, near-black band) → bg-muted (band on the modal surface) |
| 3/4-agent | in-app agent window header + chat bubbles | bg-header / bg-card dark:bg-header → bg-card (also deletes dark:-only overrides) |
| 5/6-columns-drawer | Column Visibility drawer title band | pinned bg-background → bg-modal (matches its container's new surface) |

Not shot: the two playground LLM schema/tool DialogFooters — same class
of fix as the drawer band (bg-background pin → bg-modal), deep in a
form flow.

## Round 3 nit — edge-fade gradient (7-gradient-fix.png)

InAppAgentWindow's two expanded-window edge fades keyed off from-header,
now the darkest chrome tier (2%) → near-black seam over the assistant
surface. Fixed to from-background here (assistant is bg-background on
this branch); on design-tuning where the assistant is bg-modal it should
be from-modal. Synthetic swatch comparison since the real gradient is a
~1px, streaming-only, expanded-only strip.
