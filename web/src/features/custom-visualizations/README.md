# Custom UI

Custom UI is an employee-only preview for replacing selected trace or session
data with a focused, declarative view.

## Boundaries

- `types.ts` owns the persisted definition: matching, placement, data source,
  catalog version, and the immutable JSON UI spec.
- `runtime/` owns the client-only execution boundary. It validates and compiles
  specs, resolves bindings against the normalized input envelope, renders the
  versioned Langfuse catalog, and reports privacy-safe diagnostics.
- `fns/observationVisualization.ts` owns matching and normalization from trace
  and observation records into the runtime envelope. Studio and live surfaces
  must use these same adapters.
- `components/VisualizationStudio.tsx` owns authoring and preview state. It may
  ask the server to generate or persist JSON, but rendering stays in the
  browser.
- `server/` owns authorization, persistence, model calls, and validation. It
  must never execute, render, or evaluate a saved spec.

## Safety contract

Saved UI is data, never code. Specifications can only reference components and
pure computed helpers in the pinned catalog version. There are no actions,
network calls, raw HTML, CSS, JavaScript, or iframe escape hatches.

The renderer fails closed: invalid roots fall back to the existing Langfuse
view, while component failures are isolated. Telemetry may contain structural
counts and stable failure codes, but never trace data, bindings, specifications,
or resource identifiers.

## Performance contract

Validation and compilation enforce byte, node, depth, and repeated-item limits.
The client render plan stages expensive/deep regions and defaults secondary
detail to collapsed. Session and trace pages load Custom UI only for global
admins who explicitly enabled the preview.
