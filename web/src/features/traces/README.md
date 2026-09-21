# Trace review workspace

`Trace` owns the trace data and selection providers. Desktop peek and full trace views create one
`TraceReviewPanelProvider` per project and trace, above the selected detail view.
Header actions send annotation/comment targets to its local store; they do not
own the opened panel or its lifetime.

- `traceReviewPanelStore` owns the active mode, retained target sessions, comment
  draft guards, and trigger focus restoration. Query data stays in React Query.
- `TraceReviewPanel` mounts the comment thread and annotation form once per target
  session, hides inactive content, and gates keyboard/mention behavior. Closing
  the panel preserves the draft while this trace remains mounted.
- `TraceLayoutDesktop` owns resizing. Its resizable-panel integration temporarily
  hides navigation during review and restores the user's normal layout without
  persisting the temporary split. Detail content stays mounted in the same panel.
- Comment and annotation controllers use the workspace when present. Other
  surfaces, including the queue workspace with its own score pane, retain their
  existing overlay presentation and permission checks.

Changing comment targets confirms discarding an unsent draft. Selecting another
trace destroys the workspace; drafts are not shared between traces or projects.

Same-target annotation reopening passes the fresh header snapshot through the
mounted form's imperative refresh handle. The form action reconciles by target
and config, updating clean fields in place while preserving pending writes,
invalid inputs, and row-local comment drafts. An unchanged pre-save snapshot
cannot undo a confirmed local save. This refresh belongs to the open action;
query updates do not reset mounted editors.
