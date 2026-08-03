# trace-graph-view

Read-only agent-graph renderer for the trace detail view: ELK computes the
layout, we draw HTML nodes over an SVG edge layer, d3-zoom owns the viewport.
Deliberately NOT React Flow / vis-network — the view is read-only and the
custom renderer keeps it virtualization-ready.

## Data flow (one way)

```
agentGraphData (tRPC getAgentGraphData)
  → buildStepData            timing-based step inference (cycle-guarded)
    / transformLanggraphToGeneralized   when langgraph metadata exists
  → one builder per GraphViewMode (the mode switch overlaid on the canvas):
      buildGraphCanvasData   "aggregated": repeats collapse by name (+ cycling
                             map); langgraph traces show framework nodes only
      buildExpandedGraph     "expanded": one node per observation (EVERY call,
                             minus EVENTs — framework metadata is ignored);
                             edges from the instrumented hierarchy +
                             happened-before sibling ordering (fork/join)
  → layout/elkLayout.computeGraphLayout   async ELK (lazy import);
      layout/measureNode     estimates node boxes (labels, counter reserve)
  → components/ElkGraphRenderer           draws + gestures
      components/GraphNode                view-only node (memo)
```

Both builders return the same `{graph, nodeToObservationsMap}` pair — everything
downstream is mode-agnostic. The selected mode is a trace view preference
(`ViewPreferencesContext.graphViewMode`, localStorage), passed in as a prop.

## Ownership

- **Viewport**: deterministic and data-derived — the rendered transform is
  always `userOverride ?? fit(layout, size)`. The user's last gesture
  (drag/wheel/pinch/toolbar zoom) is the ONLY viewport state; without one, fit
  re-applies on every layout/size change. Selection never moves the viewport
  (it's a ring/glow — under fit the node is always visible); Fit and a graph
  change clear the override. Per-frame pan/zoom writes the world div's CSS
  transform (and the edge stroke-compensation var) imperatively — React state
  holds only the discrete derivations (`compact` label threshold, `fitted`
  reveal, layout/error).
- **Selection**: the `?observation=` URL param, wired in
  `components/TraceGraphView.tsx` (click-cycling through a node's observations,
  URL→node sync with a parent-walk fallback for descendants without their own
  graph node).
- **Playback glow**: the active-observation set comes from
  `web/src/components/trace/contexts/PlayheadContext.tsx` (the engine); THIS
  folder owns only the projection observation-ids → node names
  (`components/TraceGraphView.tsx`) and the glow rendering (`GraphNode`).
- **Pure layout math**: `layout/*` has no React imports and is unit-tested
  (`layout/*.clienttest.ts`).

## Next migration slices

- Move ELK layout into a Web Worker (seam: `layout/elkLayout.ts#getElk`).
- Node virtualization for very large graphs (only render nodes intersecting
  the viewport — the renderer's world/viewport split is already shaped for it).
