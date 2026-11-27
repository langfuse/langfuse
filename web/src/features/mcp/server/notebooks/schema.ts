import { z } from "zod";
import { notebookDocumentId } from "@/src/features/notebooks/schema";

// Tool discovery rejects JSON Schema unions. The notebook codec parses the
// discriminated block and operation schemas when the tool runs.
export const blockDiscoverySchema = z.strictObject({
  id: notebookDocumentId.optional(),
  schema: z
    .enum(["text@1", "chart@1", "row@1", "table@1", "embed@1", "button@1"])
    .describe(
      "For embed@1, use props {target: {kind: 'trace' or 'session', id?}}. Trace targets also accept sidebar: 'expanded' or 'collapsed' as an initial layout preference. Set id for a fixed resource or bind a notebook string variable to resourceId. A trace embed also accepts an observationId binding, which takes precedence and opens the parent trace with that observation focused. For button@1, use props {label, action: {type: 'score.upsert@1', inputs: {traceId?, name, value}}}. Value is a number. Omit traceId when binding a string variable to the traceId input. Scores are upserted per reviewer, trace, and name.",
    ),
  props: z
    .looseObject({})
    .optional()
    .describe(
      "For text@1, omit props or use {}. For chart@1, use {title?, query: {schema: 'metrics@2', ...the Metrics V2 query}, display: {kind: 'line' or 'bar'}}. A line chart needs timeDimension. Optional bindFilter is the zero-based index of a string equality filter exposed as a variable input. For a KPI, use display: {kind: 'big-number', format: {style: 'decimal', 'percent', or 'currency'}, caption?}; currency also requires format.currency (e.g. 'USD'). Big numbers require one metric, dimensions: [], and timeDimension: null. For row@1, use {children: [notebook blocks]}. Widths are automatic. Use separate top-level blocks to always stack them. For table@1, use {columns: [label], rows: [{id, cells: [string or number]}]}. For a live table, use {source: {kind: 'query', query: {schema: 'observations@1', select: [field], lookbackHours: 1–336, limit: 1–100, name?}}, columns: [{field, label}], selection?: {valueField: 'traceId' or 'id'}}. Fields: id, traceId, name, type, level, startTime. Include every displayed field and the selection field in select. Bind traceId to resourceId or id to observationId on a trace embed in the same document.",
    ),
  content: z.array(z.looseObject({})).optional(),
  markdown: z
    .string()
    .optional()
    .describe("Markdown source for text@1, in place of typed content."),
});
