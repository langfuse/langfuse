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

## Key design constraint (from prod experience)

The prior viewers taught us that **the Worker itself is a cost**: always parsing
in a Worker made *fast trace-flipping on small JSON* noticeably slower. So "use
the byte engine" and "use a Worker" are **independent** decisions. Because
`load()` is O(1) and each container is scanned once only on expand, the
**main-thread** byte-engine path has near-zero upfront cost and handles the common
large case (a base64 image = one giant string leaf, never materialized) with **no
Worker**. The Worker is reserved for genuinely-huge *structured* payloads (rare),
chosen at the `buildModel` seam by a size threshold. Virtualization also breaks
browser Ctrl+F, so the viewer owns an in-viewer find.

## Status / next (phased)

- **P0 — interim gate (LFE-10847, #15230): MERGED.** Stops the crash today.
- **P1 — byte engine + async seam + renderer: done** (#15265). Covered by store
  client tests + verified in the integrated trace view. Materialization +
  wide-container pagination (LFE-11082) are built inside the engine; the
  streaming backend (LFE-11081, #15239) is merged.
- **P2 — integrate into IOPreview, MAIN-THREAD, no Worker (LFE-11084): NEXT.**
  Replace the eager JSON Beta path with the lazy renderer; add in-viewer find
  (Ctrl+F replacement, LFE-11083 main-thread slice); retire the gate for this
  path; Sentry-instrument genuine failures + a rate-limited "default miscalibrated"
  signal; size thresholds calibrated to an M1 MacBook Air 2020.
- **P3 — Worker source + GB tail:** wire a Worker `AsyncJsonSource` (byte engine
  off-thread) consuming #15239, behind the size threshold. Renderer unchanged.
  Byte-engine stream blockers first (non-JSON/raw root, empty-doc, strict
  truncation — stream-only; in-memory bytes from `JSON.stringify` are always valid
  JSON). Seam needs dispose/cancel + a progress signal for this.
- **P4 — chDB source:** when ClickHouse returns parsed JSON on demand (Valeriy),
  swap the source behind `AsyncJsonSource`; renderer + RowModel unchanged.
