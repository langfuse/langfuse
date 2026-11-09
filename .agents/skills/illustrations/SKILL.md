---
name: illustrations
description: |
  Draw, compose or change a Langfuse illustration, either an empty-state drawing
  (`EmptyState.Illustration`, `SpotIllustration`) or a product scene (`LangfuseIllustration`), in the house
  isometric style with its motion, accessibility and performance contract. Use when adding a drawing for a
  new area or moment, building a scene from engine parts, retiming how one moves, or reviewing one.
---

# Illustrations

Both families share one engine in `web/src/components/illustrations/`:

| Family                         | Public API                                                                       | Where it lives                                                                                            |
| ------------------------------ | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Empty-state drawings           | `<EmptyState.Illustration drawing motion backdrop accent />` inside `EmptyState` | `drawings/designs.ts` (shapes as data), laid out by `drawings/layout.ts`, drawn by `drawings/Drawing.tsx` |
| The same drawings on their own | `<SpotIllustration drawing size motion backdrop accent />` in a card or a step   | the same `DESIGNS`, same `Drawing`                                                                        |
| Product scenes                 | `<LangfuseIllustration variant size motion floor accent a11y content? />`        | `scenes/<name>/`, registered in `scenes/registry.ts` and `scenes/frames.ts`                               |

None of them takes `className` or `style`, and layout around them belongs to the caller's own elements. A drawing fills the height its `size` sets (`EmptyState`'s or `SpotIllustration`'s); a scene fills its parent's width up to its `size` (`sm` 320 px, `md` 448 px, `lg` 672 px; `fill` has no cap).

Outside `EmptyState`, wrap a card or link in `<IllustrationHost>` so hovering anywhere on it lifts the hero and plays a `motion="hover"` illustration, and keyboard focus in it lifts the hero without replaying it; it adds no element of its own. `usePlayback` finds that host and tracks a mouse or pen over it and keyboard focus in it (a tap or a click's focus doesn't count), and the art reads it as `data-host-active` on its own root, so no selector reaches outside the component.

`LangfuseIllustration` takes a required `a11y`: `described` exposes the scene as one image named from its content (`layout.ariaLabel`); `decorative` hides it, for a scene beside text that already says what it shows. Drawings are always decorative.

`engine/` holds the parts both families use: the projection, `Frame` (the svg root), `Block` (the raised hero), `Chip`, `slots.ts` (`label()`, `identifier()`, `asWritten()`), `SlotContent`, `usePlayback`, `useIllustrationId`, `motion.ts` (`at()`) and the shared `Scene.module.css`. Parts only scenes use sit beside them, and the drawing path never imports them: `Scene` (the frame read from a layout: label, plate, generated keyframes, defs), `useScene`, `keyframes.ts` (`packetKeyframes`, `stepKeyframes`, `play`), `Packet` (a packet along a wire), `StatusDot` (a dot and its halo), `values.ts`, `useStepper`, `activeIndex`, `CountUp`, `TypeOut`.

Read [references/style.md](references/style.md) and [references/motion.md](references/motion.md) before drawing anything; every illustration must look and move like its siblings. Component and story rules are the repo's: [react-component-guidelines](../react-component-guidelines/SKILL.md), [storybook](../storybook/SKILL.md) and `web/src/components/design-system/README.md`.

## Route A: a new empty-state drawing

1. Draw the **empty version of the object** the area holds: one raised `block` hero for the thing that exists first, the parts around it as `card`, `bar`, `dot`, `chip`, `text`, `path` and `ring`, and `dashed` outlines for what hasn't arrived yet. Check it against its siblings and place it by the mechanics in [references/style.md](references/style.md#drawing-mechanics-empty-states).
2. Add it to `DESIGNS` in `drawings/designs.ts`, in plan units, under a `/** what it shows */` comment. The name joins the `drawing` enum and the `VariantMatrix` story on its own. Drawings stay in one module: they are small data, and an empty state is first-paint content, so it renders without waiting on a chunk.
3. Run `Drawing.clienttest.ts` and `pnpm run typecheck`. The test catches a second hero, a dashed part that doesn't ghost in, and any floor shape closer than 6 px to the hero (it names the drawing, the shape's index and the gap). Move the shape, never the threshold; a card the hero stands on by design gets `isLayered: true`. The rest of the look is yours to check in the next step.
4. Look at it in Storybook: `iframe.html?id=playground-emptystate--default&args=drawing:<name>;size:sm` (then `md`, `lg`, `xl`), add `&globals=theme:dark` for dark, and emulate reduced motion in DevTools → Rendering. In `VariantMatrix`, drawings below the fold build only once scrolled into view.

Done when every line of [references/checklist.md](references/checklist.md) passes.

## Route B: a new product scene

1. Copy `scenes/observability/` as the template: `content.ts` (content type, `*_DEFAULTS`, `*_LIMITS`), `layout.ts`, `<Name>Scene.tsx`, `<name>.module.css` and `layout.clienttest.ts`.
2. `layout.ts` is pure: named steps (`axisOf`, `rowsOf`, `frameOf`, `labelOf`, `runDurationOf`, …) above one `layout<Name>(content, id)` that reads as a straight sequence of them and returns a `SceneLayout` (`projection`, `viewBox`, `floor`, `plate`, `panelGrid`, `keyframes`, `ariaLabel`, `runDuration`) plus the scene's own geometry. It starts from `SCENE_FRAMES.<name>`.
3. `<Name>Scene.tsx` takes `SceneProps<"<name>">`, calls `useScene(DEFAULTS, content, layout<Name>, motion)` for the merged content, id, layout and playback, and renders `<Scene id layout playback lift floor accent a11y defs>` around its parts. No `useMemo` on the content: callers pass it inline.
4. Register it: its content type in `SceneContent` and its lazy loader in `SCENES` (`scenes/registry.ts`), its defaults' frame in `SCENE_FRAMES` (`scenes/frames.ts`), and its default layout in `scenes/scenes.clienttest.ts`, which checks for every scene that a run ends within 3000 ms and that the defaults fill the frame the loading placeholder reserves. `LangfuseIllustration` and its `VariantMatrix` story pick it up; its code loads the first time it's drawn.
5. In `layout.clienttest.ts`, pin one golden of the defaults' resting frame and the rules only this scene has (how its rows stack, where it cuts text, what grows its frame). Generic truncation and run length are covered by the engine and scenes tests.

Done when every line of [references/checklist.md](references/checklist.md) passes.

## Gates

From `web/`: `pnpm run lint`, `pnpm run typecheck`, `pnpm run test-client src/components/illustrations`, `pnpm run test-storybook`, and `pnpm exec knip` from the repo root.
