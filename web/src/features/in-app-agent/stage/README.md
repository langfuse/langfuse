# Assistant stage (proof of concept)

An alternative presentation of the in-app agent, behind the
`assistantContextZoom` feature flag. Opening the assistant turns the page you
are on into the first message: the page is captured to a texture, the texture
flies into a message bubble while a full-screen chat zooms in around it, and
closing flies it back out onto the live page, which is never moved or
re-rendered. The bubble shows what you saw next to the structured context the
assistant receives (see `features/page-context`).

## Owner map

| Concern                                                                | Owner                                                                          |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Flag gate, keyboard shortcut, Escape, backend choice                   | `AssistantStageProvider.tsx`                                                   |
| Open/close state machine (`preparing → opening → open → closing`)      | `state/assistantStageStore.ts`                                                 |
| Page capture (snapdom), DPR and GPU texture budget                     | `capture/capturePage.ts`, `capture/resolveCaptureScale.ts`                     |
| Capture staleness, hover/idle prewarm                                  | `capture/pageCaptureCache.ts`                                                  |
| Camera model: page and chat zoom about one fixed point                 | `motion/stageCamera.ts`                                                        |
| rAF loop, hand-offs, `inert`, keyboard settling, reversal              | `motion/stageFlight.ts`                                                        |
| WebGL 2 quad (rounded mask, depth blur, shadow, tilt) and CSS fallback | `render/*`                                                                     |
| Chat UI (rail, thread, attachment card, composer)                      | `components/*`                                                                 |
| Backends behind one `StageChatController`                              | `chat/useInAppAgentStageChat.ts` (live), `chat/mockStageChatStore.ts` (mocked) |

## Invariants

- The live page is only covered, never transformed: state such as scroll
  position and the selected observation survives because nothing moves. The
  stage renders in its own `stage` overlay layer, above the page's dialogs and
  drawers, and is an outside-interaction opt-out region, so covered overlays
  such as a trace peek neither paint over it nor dismiss themselves.
- Page texture and chat layer read the same progress inside one rAF callback,
  so they cannot drift. Every effect is zero at both ends of the flight, which
  makes the swaps with the live page and the bubble thumbnail invisible.
- Captures never include the stage itself or transient overlays, and
  the capture engine's own DOM writes never count as page changes.
- The live backend is used whenever the deployment has an assistant; the
  mocked responder only exists for deployments without one.

## Review options

- `?assistantStageSlowMotion=<1-20>` stretches the flight.
- `?assistantStageRenderer=css` forces the CSS fallback renderer.
