# Session detail ownership

`index.tsx` owns session queries, header actions, filters, saved views, and the
feature-flagged choice between the existing card layout and Modern Session.

## Render boundaries

- `TraceRow.tsx`: legacy trace card and lazy-load boundary.
- `TraceEventsRow.tsx`: events-backed trace content for card and Modern Session
  feed surfaces.
- `ModernSession.tsx`: span-list integration, scroll-spy derivation, smooth
  navigation, and the continuous virtualized feed.
- `ModernSessionObservationList.tsx`: virtualized, collapsible turn groups with
  span search and idle-gap separators.
- `ConnectedModernSessionObservationList.tsx`: tRPC-backed observation rows for
  `ModernSessionObservationList`.
- `SessionVirtualizedRow.tsx` + `useStableVirtualRowMeasurement.ts`: translated
  DOM-safe dynamic row measurement.
- `SessionObservationIO.tsx`: bounded observation payload rendering and the
  bridge into `IOPreview` full/conversation modes.

Modern Session prepares each events-backed observation once inside its narrow
row container and passes the parsed I/O plus ChatML result through `IOPreview`.
The existing card surface keeps its lazy parser path.

## State

`sessionDetailStore.ts` is a per-page store. It owns loaded trace IDs,
correction visibility, inline-tool visibility, and system-prompt visibility so
virtual row remounts do not reset view state. On the events-backed session
page, `modernSession` is a user Feature Preview flag; disabled users retain the
card layout without a page-level layout control. The preview toggle is disabled
unless the V4 Preview toggle selects this events-backed page.

Server/query state remains in tRPC and React Query. Active Modern Session state
is derived from TanStack Virtual's current scroll offset unless the user
explicitly selects a turn that cannot reach the feed's top edge. User
scrolling restores scroll-spy ownership; no effect mirrors either state.
The span rail distinguishes loading turn summaries from loading the span rows
inside an already-known turn; only the latter can show turn and span counts.
