---
name: notebook-authoring
description: Create, revise, and publish Langfuse notebooks that guide a reader through findings and evidence.
---

# Notebook authoring

## Start the draft early

When the user asks for a notebook, create the draft as soon as you know the question and scope, before the bulk of the investigation. Write a short opening in `main` with the question, time window if relevant, and what you’ll check. The reader can open the live draft while you work.

Never generate a full notebook document in one tool call, even for a first draft or a final rewrite. Use `write_document` only to seed a new document with a short opening. Use `patch_document` for all subsequent writing: append one short section or evidence block per call, and replace or remove individual blocks when revising. Split large tables or evidence sections into smaller, useful blocks instead of batching them into one call.

Investigate one reader question, then save what you found and the evidence that supports it before moving on. Mark provisional findings and revise them as new evidence comes in. Keep raw tool output and scratch notes out of the draft.

Use aggregate metrics for trends and comparisons. Start trace and observation reads with IDs, names, status, duration, and cost where available. Fetch raw inputs or outputs only for a specific example when they are needed to support a finding.

## Read and edit one block at a time

For a trace embed, set `props.target.sidebar` to `"expanded"` when the trace tree or execution order is part of the evidence, or `"collapsed"` when readers should focus on the details. Readers can still toggle the sidebar.

Use `get_notebook` to discover documents, then `read_document` with `mode: "outline"` to scan headings, block IDs, and row nesting. These tools prefer the current draft when there are unpublished changes. To inspect a block, call `read_document` with its `blockId` instead of outline mode. Use a full read only when you need the entire body.

Use the same `patch_document` arguments for prose, charts, tables, and embeds:

- `insertBlock` adds one block. For prose, pass `{"schema":"text@1","markdown":"## What changed?\nErrors rose after the deployment."}`. Omit placement to append at the root, or pass one of `beforeId`, `afterId`, or `parentId`.
- `replaceBlock` plus `blockId` replaces one block and preserves its ID and evidence links.
- `removeBlockId` removes one block.

`documentId` defaults to `main`. Use the returned `href` to link to a block you just inserted or replaced. Make one edit per call.

## Write for the reader

Investigate in whatever order helps you understand the data. Write the report in the order that helps the reader decide what to do.

- Open with the takeaway, scope, and decision or next step. Use reader questions as section headings.
- Introduce each chart, table, or trace with what to look for and why it matters. Keep evidence that changes the conclusion or next step. Separate observations from hypotheses and make important limitations explicit.
- Lead with a chart when the reader needs to see a trend, ranking, or breakdown. Use a line chart for trends, stacked bars for how a total and its mix change over time, and sorted bars for category comparisons. Keep tables for exact-value lookup and selecting individual examples. For example, chart daily spend by model group and rank use cases by total spend; discuss cost per trace separately.
- Link findings to nearby evidence with `[See timeout examples](#block-timeout-examples)`, using the actual target block ID. Link the first mention of a specific trace, span, or generation using its real IDs: `/project/{projectId}/traces/{traceId}` or `/project/{projectId}/traces/{traceId}?observation={observationId}`.
- Keep a selection table and the embed it controls in the same responsive row, table first. Keep the table compact and let the renderer wrap it.

For example, instead of “I queried errors by environment, then by workflow,” write “Errors spiked in `default` on Nov 21–23. Similar counts across workflows make a shared dependency worth checking, but counts alone don’t establish failure rates. Start by inspecting a representative timeout.”

Before publishing a report you authored or substantially revised, review the whole draft: scan every document's outline, then read the prose and supporting blocks individually as needed. Revise section by section: move the takeaway up, remove scratch notes and redundant views, replace tables that make readers scan for a pattern with charts, and check that each finding has evidence and each link points to the intended target. Run `validate_notebook` without a `documentId` after the last edit. Fix any errors and pass the resulting `snapshotFingerprint` as `expectedSnapshotFingerprint` to `publish_notebook` to request approval for that draft.

## Recipe: let the reader pick a trace to inspect

1. Pass this row as `insertBlock` to `patch_document` with the `notebookId`. Replace `trace-a` and `trace-b` with actual trace IDs. The row ID is the prose link target; the table row IDs are the values passed to the preview.

```json
{
  "id": "timeout-examples",
  "schema": "row@1",
  "props": {
    "children": [
      {
        "id": "timeout-table",
        "schema": "table@1",
        "props": {
          "columns": ["Example", "Duration (s)"],
          "rows": [
            { "id": "trace-a", "cells": ["Checkout timeout", 30] },
            { "id": "trace-b", "cells": ["Retry timeout", 32] }
          ]
        }
      },
      {
        "id": "timeout-preview",
        "schema": "embed@1",
        "props": { "target": { "kind": "trace" } }
      }
    ]
  }
}
```

2. Pass the variables and bindings below with `notebookId` to `update_notebook_layout`. For an existing notebook, merge these entries with its staged variables and bindings before submitting. Omit `layout` to keep the current layout. Set the default to a representative row's trace ID so the preview opens with evidence already visible.

```json
{
  "variables": [
    { "id": "timeout-trace", "name": "Timeout trace", "type": "string", "defaultValue": "trace-a" }
  ],
  "bindings": [
    {
      "kind": "write",
      "variableId": "timeout-trace",
      "from": { "documentId": "main", "elementId": "timeout-table", "portId": "selection" }
    },
    {
      "kind": "read",
      "variableId": "timeout-trace",
      "to": { "documentId": "main", "elementId": "timeout-preview", "portId": "resourceId" }
    }
  ]
}
```

3. Use the `href` from the insert result: “Select a row in [Timeout examples](#block-timeout-examples) to compare where the request stalled.” The link jumps to the row; selecting a table entry updates the preview. Run `validate_notebook` after wiring the layout.
