# The motion

Motion explains what the object does; it is never decoration. The **choreography** is the same everywhere:

1. The hero renders first and never leaves. In a replay it presses or recounts; it is never cleared.
2. What exists comes next, emerging from the hero: its face details in reading order, then the floor outward, later the farther a part is from the hero.
3. Wires and data lines draw out from the hero, at an even pace, like data arriving.
4. Dashed outlines of what's still to come ghost in last.

Each step starts as the one before lands: no dead time, nothing waiting on nothing.

## Empty-state entrance (`drawings/Drawing.module.css`)

| Beat       | Starts          | Animation                                                                                      |
| ---------- | --------------- | ---------------------------------------------------------------------------------------------- |
| Hero lands | 0 ms            | `illustration-land`: a 720 ms spring, its shadow resolving under it (`illustration-shadow-in`) |
| Emerge     | 180 ms + ripple | 380 ms ease-out, from 6 units back toward the hero                                             |
| Draw       | 240 ms + ripple | 460 ms, the stroke drawing along `pathLength=1`                                                |
| Ghost      | 440 ms + ripple | 480 ms ease-out, from `scale(0.97)` with the dashes sliding into place                         |

Ripple is 1.2 ms per plan unit from the hero, capped at 240 ms; parts of one object stagger 40 ms. A shape inside a card enters with that card. `drawings/layout.ts` computes every cue from the shapes, so a new drawing gets its choreography from its geometry; you never time a drawing by hand.

## Scene runs (`engine/Scene.module.css`, `engine/motion.ts`, `engine/keyframes.ts`)

- The first build starts from a hidden frame: the stage fades in (200 ms), the blocks land 80 ms later (`BUILD_LEAD`), and every other time in the run shifts by the same lead.
- A replay first clears what's there (`CLEAR_FOR`, 180 ms, faster than any entrance), then each part comes back at its own `--at` from `at()`: `pop`, `draw`, `slide`, `fadeIn`, `rise`, `flash`.
- Content-dependent motion is generated keyframes: `packetKeyframes()` for a packet along a wire, `stepKeyframes()` for a crosshair or tooltip, played with `play()`.
- Numbers count up with `CountUp`, text types with `TypeOut`. `formatValue()` formats every step at the landing value's width, so a counter never grows wider than where it lands.
- A whole run fits in 3000 ms.

## Easing and scale

Ease-out `cubic-bezier(0.23, 1, 0.32, 1)` (`--illustration-ease-out`) for entrances, linear for lines drawing at an even pace, `ease` for a colour flash, the shared springs for landings and the hover lift. Never `ease-in`: it holds back the first frames, the ones the eye is on. Things appear from a visible size (`scale(0.8)` or more) with opacity, never from nothing. Exits are quicker than entrances: the hover lift rises on its spring (887 ms) and settles back in 400 ms on the ease-out, through `--illustration-lift-for` and `--illustration-lift-ease`, which a scene's own lifted part uses too. Parts of one object stagger 40 ms: short enough that nothing waits.

## Presets

| Component                 | `motion` | Does                                                                    |
| ------------------------- | -------- | ----------------------------------------------------------------------- |
| `EmptyState.Illustration` | `subtle` | Builds once in view; the dashes march and dots pulse only while hovered |
|                           | `hover`  | Still until hovered; each hover rebuilds it                             |
|                           | `off`    | Never moves                                                             |
| `LangfuseIllustration`    | `once`   | Builds once in view                                                     |
|                           | `hover`  | Still until hovered; each hover replays it                              |
|                           | `off`    | Never moves                                                             |

There is no auto-looping preset: anything that starts by itself ends within a run, and loops run only while the host is active: a mouse or pen over it, or keyboard focus in it. A tap doesn't count, so nothing is left running on touch. `EmptyState` sets `data-illustration-host` on its root, and `IllustrationHost` sets it on any other card or link; `usePlayback` tracks that host and the art reads it as `data-host-active`. A `motion="hover"` illustration replays on a pointer entering; keyboard focus only lifts it, since tabbing through a row of cards would rebuild every one.

Pick `subtle` (drawings) or `once` (scenes) for pages people return to; `hover` replays on every visit of the pointer, so it suits a card someone hovers once, like an onboarding step.

## Reduced motion

The same order as plain 240 ms fades: nothing moves, generated keyframes are off (`--illustration-play: none`), counters and typed text show their final value. Every new animation gets its `prefers-reduced-motion: reduce` counterpart in the same module.
