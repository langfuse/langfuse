# Session review

`SessionPages` owns one keyed `TraceReviewPanelProvider` per project/session.
Header, trace-row, and timeline actions open the same persistent Comments or
Annotate editor. Query data stays in tRPC; draft state belongs to the mounted
editor and the shared review store.

`SessionReviewWorkspace` subscribes only to the active review mode. It measures
available space and lays out session content beside or above the review panel.
Its layout effects control the resizable-panel API and reveal review inside
the narrow workspace scrollport; changing layout
keeps the session and both editors mounted. Modern session minimap/feed grids
use the session column's container width.

Trace peek is a sibling outside the session review provider. Its review context
and mobile overlays remain independent of the underlying session.

## Transcript timeline

`ConnectedModernSessionBodyTimeline` owns the shared sidebar and activates
20-trace chunks from sidebar visibility and the timeline viewport. The existing
conversation timeline uses `useSessionTraceTranscripts` to call
the existing per-trace transcript endpoint with at most four requests running
at once; results stay in the query cache and pending requests are cancelled
when no longer observed. Sidebar metadata controls loading and filtering of the
displayed messages.

`SessionConversationTimelineTrace` renders transcript content for every thread
using the existing timeline message/part components. Current-turn times describe
the source observation. It does not normalize or deduplicate again. Navigation
opens the trace or source observation from the feed, retains sidebar navigation
to source observations, and exposes observation actions for matched messages.
