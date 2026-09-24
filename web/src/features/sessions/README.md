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
