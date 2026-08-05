# Dark-mode layering pass (design-system-updates branch)

Model: "layers become one step lighter with each added layer" (Carbon's
dark-theme layering rule; Hex and Cloudflare Kumo follow the same structure).
Global frame is the darkest tier; content canvas one step above; ~2.5pp per
layer. Light mode unchanged (Carbon: light layers alternate white/gray).

## Ladder (dark, HSL lightness)

| Tier | Before | After |
|---|---|---|
| chrome (`--header`, `--sidebar-background`) | 6.3% (lighter than canvas!) | **2%** |
| canvas (`--background`) | 3.5% | **4.5%** |
| card (`--card`) | 8.2% | **7%** |
| modal (`--modal`, NEW — Dialog/AlertDialog/Sheet/Drawer/peek) | = background 3.5% | **9.5%** |
| popover (`--popover`, menus/tooltips — stack on modals) | 10.2% | **12%** |
| hairline (`--border`) | 10.5% (≈ popover → invisible) | **15%** |
| code well (`--surface-code`) | 2.3% (recessed, unchanged) | 2.3% |

## References

- **Hex** (`0-reference-hex-projects.png`, sampled): sidebar `#1a1a22` (11.8%),
  content `#1f1f28` (13.9%), selected nav 16.7%, chips 27%, borders 22%.
  Chrome darker than content; every layer steps lighter.
- **Carbon** (carbondesignsystem.com/elements/color/overview): dark Gray-100
  theme `#161616 → #262626 → #393939 → #525252`. "Do not apply components
  that are darker than the background." Light themes alternate White/Gray-10.
- **Kumo** (kumo-ui.com/colors): dark canvas `#030303` → base `#0f0f0f` →
  overlay `#262626`; hairline `#262626`; `shadow-edge` = white/10 rim in dark;
  status tints carry alpha so they compose on any surface.

## Follow-ups (not in this pass)

- Fills vs surfaces: `--muted`/`--secondary` (11.6%) sit below popover (12%) —
  chips/separators inside popovers barely read. Needs a dedicated fill family
  (Kumo `control`/`fill`/`fill-hover`) or alpha-based fills.
- Consider a light-alpha edge (white/10) on popovers/modals instead of the
  near-invisible dark shadow.
