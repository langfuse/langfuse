# PR #15346 with current/main tokens — verification round

Captured after the split reverts (da28092fa theme, c5b49a051 sidenav) on
`session-redesign`, i.e. exactly what #15346 will look like if it merges
before #15418/#15419. Dev server on the branch, seeded session
`session-shapes-s42-chat`, project `7a88fb47-b4e2-43b8-a06c-a5ce950dc53a`.

## Files

| File | State |
| --- | --- |
| 01-session-page-{light,dark}.png | Session page: header + metrics chips, span rail with percentiles and cross-hatch idle bands, conversation feed |
| 02-inspector-open-{light,dark}.png | Observation inspector open (span-list click), metrics grid + IO zones |
| 03-trace-peek-{light,dark}.png | Trace peek panel (Open Trace View): tree, graph, TraceSidePanel with scores/metadata accordions |

## Broken-with-main-tokens list

**Nothing found that is broken (vs. merely different).** Checked in both themes:

- Session header chips, percentile rail numbers, cross-hatch idle bands —
  all render on `--border-contrast`/`--muted` correctly with main values.
- Observation inspector: the dark metrics/IO chrome in LIGHT mode is the
  intentional session-scoped "code is a well" design (its
  `--session-code-well-*` tokens stayed in #15346); it renders identically
  to the v5-token build because those tokens were never in #15418.
- Conversation bubbles, turn dividers, ghost prev/next, peek panel chrome,
  scores/metadata accordions — all fine on main tokens.

Differences (expected, not logged as issues): cooler near-white/near-black
surfaces instead of warm paper/greige, fainter light-mode hairlines, dark
header tier back to near-black (`0 0% 2%`), system mono instead of Geist
Mono for eyebrows/IDs/metrics.

One non-token observation: while scripting theme flips (localStorage swap +
reload in one automation pass), a couple of captures caught the inspector
overlay mid-transition with mixed light/dark chrome. Re-verified at steady
state in BOTH open flows (URL-restore and click-open): computed panel
backgrounds are correct (`bg-background` light / `bg-modal` dark). Not
reproducible through normal use; noting it only in case a user report about
a "dark inspector in light mode" ever surfaces.
