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
20-trace chunks from sidebar visibility and the timeline viewport. It uses
`useSessionTraceTranscripts` to fetch once for both the sidebar and timeline from
the existing per-trace transcript endpoint with at most four requests running
at once; results stay in the query cache and pending requests are cancelled
when no longer observed. Unfiltered observation queries supply action metadata;
the transcript supplies the displayed messages and tools. Sidebar search matches
message previews, roles, and tool names across the session.
Observation filters and saved views apply only to the legacy session view.
`SessionConversationSidebar` owns transcript navigation and search;
`ModernSessionSidebar` remains the observation-based sidebar for the legacy view.

`SessionConversationTimelineTrace` renders transcript content for every thread
using the existing timeline message/part components. Current-turn times describe
the source observation. It does not normalize or deduplicate again. Navigation
opens the trace or source observation from the feed and exposes observation
actions for matched messages. The sidebar shows explicit message roles and tool
names. Both views use `getSessionTranscriptRows` for grouping and row IDs so
sidebar navigation scrolls to the exact message or tool, even when several rows
share a source observation.
