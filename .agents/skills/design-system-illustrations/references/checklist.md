# Done checklist

Run every line that applies against the finished illustration; each is pass or fail. Lines are tagged **both**, **drawing** (empty-state drawings) or **scene** (product scenes). It is done when all of them pass.

## Accessibility

- [ ] **drawing** The art stays decorative (`aria-hidden`, `focusable="false"`): the `EmptyState.Title` and `EmptyState.Description` beside it carry the meaning, and the title's `level` fits the page outline.
- [ ] **scene** With `a11y="described"`, one `role="img"` whose `aria-label` (from `layout.ariaLabel`) names what it shows, with its values, built from the content rather than written as fixed text; with `a11y="decorative"`, `aria-hidden` and no role.
- [ ] **both** Nothing inside the svg takes focus or a click.
- [ ] **both** Anything that starts by itself ends within the 3000 ms run; infinite animations run only while a fine pointer hovers (`(hover: hover) and (pointer: fine)`) or keyboard focus sits in the host card (WCAG 2.2.2).
- [ ] **both** Nothing flashes more than three times a second (WCAG 2.3.1).
- [ ] **scene** Status reads without colour: a pass or fail tone always sits beside a value or label that says it.
- [ ] **scene** Lines and labels that carry meaning reach 3:1 against their face in both themes (WCAG 1.4.11). Text uses `ink`, `ink-2`, `label` or a status token; `guide` and `line` are for outlines only.
- [ ] **both** Under emulated reduced motion it builds in the same order as fades, and counters show final values.

## Performance

- [ ] **both** Animations touch only transform, opacity, stroke-dash and the registered `--illustration-press` / `--illustration-hover`; no layout properties.
- [ ] **scene** No React state changes per frame; counters write the text node (`useStepper`).
- [ ] **drawing** It is data in `designs.ts`, not a new component.
- [ ] **both** Coordinates are rounded (`round()`, 2 decimals at most).
- [ ] **both** No new filters, images or fonts; the shared shadow blur is the only filter.
- [ ] **both** Playback goes through `usePlayback` (one observer, disconnected after the entrance).
- [ ] **drawing** The server render is the finished frame, sized by its `viewBox`, so nothing shifts on hydration.
- [ ] **scene** Its defaults fill `SCENE_FRAMES.<name>`, so the placeholder shown while its code loads has the same size (`scenes.clienttest.ts`).

## Responsiveness

- [ ] **drawing** It fills the height `EmptyState`'s `size` gives it and fits at every size, `sm` to `xl`; chips and text stay four characters or fewer, so they read as shapes at `sm`.
- [ ] **scene** It fills its parent's width and stays readable at 320 px; long content truncates at its `*_LIMITS` and the frame grows rather than overlapping, clipped to its own edge.

## Style

- [ ] **both** Colours are `var(--illustration-*)` only; no hex.
- [ ] **both** Exactly one hero.
- [ ] **drawing** It is distinct from every sibling in `designs.ts`.
- [ ] **drawing** Every floor shape keeps 6 px (aim for 8) from the hero's face and the sides under it, the clearance test is green, and any card the hero stands on by design is `isLayered: true` ([style.md](style.md#drawing-mechanics-empty-states)). Checked by eye at `xl` too: the outline starts clear of the front edge, not on it.
- [ ] **both** Text is `<text style={{ fontSize }}><SlotContent slot /></text>`; no component takes `className` or `style` props.
- [ ] **scene** Every CSS selector has a local class of its module.
- [ ] **both** Light and dark both checked.
