# Session detail ownership

`index.tsx` owns session queries, header actions, filters, saved views, and the
feature-flagged choice between the existing card layout and Modern Session.
On the Modern Session path the redesigned header applies: no filtering toolbar
(the observation list's search + type funnel is the only filter; the feed/list/
inspector read the unfiltered session), a mono metrics line
(Traces · P50 · Tokens · Cost · User ID) with session score chips, and a
session kebab (favourites / share / copy ID) replacing the header icon trio.
Saved views, LLM-call presets, and the filter builder remain on the legacy
card layout only.

## Render boundaries

- `TraceRow.tsx`: legacy trace card and lazy-load boundary.
- `TraceEventsRow.tsx`: events-backed trace content for card and Modern Session
  feed surfaces.
- `ModernSession.tsx`: minimap, scroll-spy derivation, smooth navigation, and
  the continuous virtualized feed.
- `SessionVirtualizedRow.tsx` + `useStableVirtualRowMeasurement.ts`: translated
  DOM-safe dynamic row measurement.
- `SessionObservationIO.tsx`: bounded observation payload rendering and the
  bridge into `IOPreview` full/conversation modes.
- `inspector/ObservationInspector.tsx`: Modern Session's right-hand
  observation inspector panel. Opens by clicking an observation in the feed;
  shows a type-aware overview grid, I/O zones, scores, and metadata without
  leaving the session. Selection state (`inspectedObservation`) lives in the
  session detail store.
- `ObservationList.tsx`: Modern Session's COL 2 — collapsible turn cards with
  per-turn observation rows, span search, and the funnel type filter.
- `ConversationTurn.tsx`: Modern Session's redesigned conversation turn (user
  bubble + unboxed generations + tool-call lines + hover footers).
  `buildTurnModel` is deliberately conservative: any turn whose data doesn't
  fit the user-message + generations shape returns null and TraceEventsRow
  falls back to the existing observation rendering — the redesign must never
  hide payloads it cannot express.

Modern Session prepares each events-backed observation once inside its narrow
row container and passes the parsed I/O plus ChatML result through `IOPreview`.
The existing card surface keeps its lazy parser path.

## State

`sessionDetailStore.ts` is a per-page store. It owns loaded trace IDs,
correction visibility, inline-tool visibility, and system-prompt visibility so
virtual row remounts do not reset view state. On the events-backed session
page, `modernSession` is a user Feature Preview flag; disabled users retain the
card layout without a page-level layout control. The preview toggle is disabled
unless Fast (Preview) selects this events-backed page.

Server/query state remains in tRPC and React Query. Active Modern Session state
is derived from TanStack Virtual's current scroll offset unless the user
explicitly selects a minimap item that cannot reach the feed's top edge. User
scrolling restores scroll-spy ownership; no effect mirrors either state.
