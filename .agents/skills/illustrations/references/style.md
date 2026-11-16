# The look

## Geometry

- Everything on the floor is laid out flat in **plan units** and drawn through one projection, `PROJECTION = [0.9384, -0.3415, 0.4993, 0.8648]` (`engine/projection.ts`): x runs along the floor's −20° axis, y along its 60° axis. Grid cells are 36 units. Two scenes (playground, metrics) scale it down slightly to fit; scale, never re-angle.
- One **hero** per illustration: a `Block` standing off the floor (depth 14 in drawings, 16 in scenes) whose top face carries the most important detail. It is the thing that exists first. On hover it lifts 7 px; `accent="highlight"` paints its face and the solid chips in the brand's black (white in dark mode).
- Around it, flat on the floor: outlined cards, skeleton bars where text will go, status dots, chips, wires. **Dashed** means "not here yet": placeholder cards, hollow dots, pending lines.
- Frames come from content: `fitViewBox` grows the viewBox around long text or extra rows, so nothing clips; the floor's radial fade carries the grid past the panel.

## Drawing mechanics (empty states)

- **Order in `DESIGNS`**: app areas in the order the sidebar lists them, then moments (`noResults`, `instrument`, `firstTrace`, `failedSpan`), with `fallback` last. Shapes inside a drawing are listed in drawing order, hero last, so it paints over the floor.
- **Distinct from its siblings**: read the `/** … */` line above every drawing first. A new one needs its own hero object or composition (`automations` already owns a `POST` hero; a webhook drawing would wire one out to an endpoint card instead).
- **The hero's face**: `on` shapes use coordinates relative to the hero's top-left corner.
- **Clear of the hero**: the hero is painted last and its sides hang 14 screen px under its face, so anything on the floor inside that footprint disappears under the front face. Every card, bar, chip, text, dot and ring keeps **at least 6 px of air** from the face and the sides (aim for 8): in plan units that's **20 below the face's bottom edge** (`rect.y + height`; 22 for 8 px) for a shape under the hero, or 7 beyond its right edge (9 for 8 px) for one beside it. `Drawing.clienttest.ts` ("keeps every floor shape clear of the hero") measures this for every drawing.
- **Layered on purpose**: when the hero stands on a card by design (a row raised out of its table, a readout over its chart), mark that card `isLayered: true`; it's the only way past the clearance test. Wires are exempt: they draw out from the hero.
- **Contents of a card**: a shape listed after a card and inside its rect (within 1 unit) enters with that card; inside a dashed card it ghosts in with it.
- **Chip size**: `chipWidth` = characters × 0.6 × size + 12, `chipHeight` = size × 1.45 (size 16 by default).
- **Text is texture**: drawings are decorative, so chips and text read as shapes at `size="sm"`; keep them to about seven characters or fewer (`v2`, `POST`, `09:41`, `pk-lf-…`).

## Strokes

All strokes use `vector-effect: non-scaling-stroke`, so they stay crisp at every size. Block edges 1.6, cards and inner edges 1, wires 1.25, data lines 1.5. Guides dash `4 4`, placeholders `5 4`, hollow dots `3 2.5`; whatever marches loops on 99 units, a whole number of each period. Round joins and caps on data lines, pending lines and block edges; wires keep their corners.

## Colour

Only the `--illustration-*` tokens, read as `var(--illustration-*)`. They are set on the svg root in `engine/Scene.module.css`, so nothing outside the art reads them: most alias an app colour, and the few that can't (the shadow, a brand mark, some dark values) are fixed values. A new role gets a new token there, on `.root`, plus a dark value under `:global(.dark) .root` only when the light one doesn't carry over. Masks and gradient stops use the keywords `white` and `black`.

A scene never keys on the frame's attributes (`data-accent`, `data-running`, `data-from`, the svg itself). Text or a mark on the hero reads an on-hero token with its own colour as the fallback (`fill: var(--illustration-on-hero-ink, var(--illustration-ink-2))`), a part that animates once a run plays gets the scene's own class from `playback.runs`, and a hero that isn't a `Block` lifts by `--illustration-lifted` (1 while the host is active).

| Role        | Tokens                                                                                                        |
| ----------- | ------------------------------------------------------------------------------------------------------------- |
| Floor       | `panel` (tinted plate), `grid`                                                                                |
| Lines       | `line` (cards, wires), `guide` (dashed), `edge` (block outline)                                               |
| Text        | `ink`, `ink-2`, `label`                                                                                       |
| Block faces | `top`, `front`, `left`; derived `hero-top`                                                                    |
| Fills       | `soft` (skeleton bars, soft chips), `solid` / `solid-ink` (dark chips), `packet`                              |
| Status      | `pass`, `fail`, `neutral`, `warm`, through `data-tone` and the `.toned` class                                 |
| Accent      | `highlight`, `highlight-ink`, `highlight-warm`; while it's on, `on-hero-ink`, `on-hero-label`, `on-hero-warm` |
| Brand marks | `claude`                                                                                                      |

## Text

- IBM Plex Mono (`--illustration-font` = the app's `--font-mono`) at a 0.6 em advance: `textWidth()` makes every string's width exact, which is how layouts place values and size chips.
- 20 px in scenes, 16 px in drawings, set as `style={{ fontSize }}` on the `<text>` (an attribute loses to the stylesheet). Weight 400.
- Labels are sentence case (`label()`), keeping acronyms, versions and code-ish words. Identifiers (span names, models, ids) stay exactly as written (`identifier()`).
- Every slot has a limit in `*_LIMITS`: labels cut at the end, identifiers in the middle, and `SlotContent` keeps the full text in a `<title>`.
- Values go through `formatValue()`: durations `0.63s`, costs `$0.00064`, percents, counts.

## Backdrops

`grid` (lines only, on the page's own background) for empty states, `panel` (the tinted plate) where the illustration stands alone as a picture, `none` inside a box that already has its own surface.
