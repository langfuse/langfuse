# Sessions

`SessionsTable.tsx` owns the list's native filters, saved views, columns and
pagination. Agent profiles reuse it with an immutable `agentScope`; that scope
is separate from user filters and stays fixed when a view is selected or filters
are cleared. The profile owns the date range and environment. Scoped results and
loading placeholders include the same identity and window.

The session router checks access to the agent preview before every scoped read.
The shared sessions service qualifies real session IDs through current agent
trace membership, then aggregates all session activity in the selected period
and environment. A sessionless trace is not converted into a synthetic session.
The session's full detail page retains its existing conversation, tools and trace
inspection; opening it leaves the list's activity window.

The table's existing filter and selection controller remains in this module.
Exports preserve the immutable scope through their queued read. Agent-scoped
bulk annotation is unavailable until its queued selector preserves session
membership. Ordinary project and user session tables keep their existing actions.
