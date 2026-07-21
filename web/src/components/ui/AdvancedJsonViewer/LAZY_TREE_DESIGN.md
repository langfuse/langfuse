# Lazy JSON viewer — design (LFE-11080/82, under LFE-10847/LFE-10152)

## Problem

The JSON Beta viewer virtualizes the DOM (only visible rows paint) but builds the
**entire** node tree up front, on the main thread, before any paint. A ~20 MB
structured payload is ~1M nodes → the build freezes the tab; `JSON.parse` itself
blows heap 5–8.5× and hard-walls at the ~512 MB JS-string cap. Interim stopgap: a
node-count gate (LFE-10847, PR #15230). This is the real fix: **never build,
parse, or hold more than what is expanded/visible.**

## Architecture (validated by the LFE-11079 spike + Fable review)

Bytes in, lazy index, materialize on demand — **one engine, one model, one
renderer**:

```
raw UTF-8 bytes ──▶ ByteJsonIndexEngine ──▶ AsyncJsonSource ──▶ TreeRowModel ──▶ (renderer)
  (streamed or        byteJsonIndex.ts      asyncJsonSource.ts    treeRowModel.ts
   stringified)       cached offset index   nodeId-keyed async    flatten/expand/paginate
```

- **`byteJsonIndex.ts`** — our own UTF-8 byte indexer (never a JS string of the
  whole doc, never a whole-doc `JSON.parse`). Scans a container **once** and
  caches a columnar child-offset table, so pages after the first are O(page)
  (measured ~5000× faster than re-walking). Values materialized by slicing +
  `TextDecoder`; precision preserved (bigint / raw string) for leaves; a
  `ByteScanner` seam lets a WASM hot-loop drop in later.
- **`asyncJsonSource.ts`** — the async, nodeId-keyed child-source seam
  (`root` / `childrenPage` / `getValue`). `createInProcessSource(bytes)` wraps the
  engine on the main thread; a Worker source implements the same interface for the
  ~1 GB streamed path. **`sourceFromValue(value)`** is the in-memory entry:
  `JSON.stringify → UTF-8 → engine` — so in-memory data uses the SAME engine, not
  a second tree (per the spike's "unify on the byte engine" decision).
- **`treeRowModel.ts`** — the ONE flatten/expand/paginate implementation over a
  source. Only expanded levels are fetched; wide containers page with a "load
  more" row; the flattened visible list rebuilds iteratively (deep-tree safe) on
  structural change. Hardened per the review: a **revision** counter stamped onto
  every `getRows` window (stale-read detection for async/worker responses), a
  **`getValue` error envelope** (never throws), and truncation/byteLength
  passthrough.
- **`rowModel.ts`** — the renderer-facing contract the renderer is built against
  exactly once.
- **`react/`** — the async virtualized renderer over the seam (see
  `react/README.md`). A per-mount vanilla Zustand store (`rowModelStore.ts`) owns
  the model lifecycle and all async actions; `LazyJsonList` only positions row
  shells and reports the visible range back; `LazyJsonRow` is view-only.
  `LazyJsonViewer` is the in-memory entry (gate-render on the model, one
  integration-boundary effect). The identical renderer will run over the Worker
  source unchanged.

## Status / next

- Done: engine (LFE-11082), source + model + hardened contract, backend streaming
  endpoint (PR #15239), **async virtualized renderer over the in-memory source
  (this commit)** — demoable via `LazyJsonViewer.stories.tsx`.
- Next: the byte-engine **blockers** for the _streamed_ (non-JSON-guaranteed)
  path — B1 non-JSON/raw root → string-leaf fallback, B2 empty-doc, B3 strict
  truncation detection; endpoint integrity header. Then wire the Worker source
  behind `AsyncJsonSource` (the renderer does not change), then integrate into the
  trace view and retire the gate. (In-memory bytes come from `JSON.stringify`, so
  they're always valid JSON — B1/B2/B3 are stream-only.)
