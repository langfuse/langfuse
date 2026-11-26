import { z } from "zod";
import { notebookDocumentId } from "@/src/features/notebooks/schema";

// Tool discovery rejects JSON Schema unions. The notebook codec parses the
// discriminated block and operation schemas when the tool runs.
export const blockDiscoverySchema = z.strictObject({
  id: notebookDocumentId.optional(),
  schema: z
    .enum(["text@1", "chart@1", "row@1", "table@1", "embed@1", "button@1"])
    .describe(
      "For embed@1, use props {target: {kind: 'trace' or 'session', id?}}. Trace targets also accept sidebar: 'expanded' or 'collapsed' as an initial layout preference. Set id for a fixed resource or bind a notebook string variable to the resourceId input. For button@1, use props {label, action: {type: 'score.upsert@1', inputs: {traceId?, name, value}}}. Value is a number. Omit traceId when binding a string variable to the traceId input. Scores are upserted per reviewer, trace, and name.",
    ),
  props: z
    .looseObject({})
    .optional()
    .describe(
      "For text@1, omit props or use {}. For chart@1, use {title?, query: {schema: 'metrics@2', ...the Metrics V2 query}, display: {kind: 'line' or 'bar'}}. A line chart needs timeDimension. Optional bindFilter is the zero-based index of a string equality filter exposed as a variable input. For a KPI, use display: {kind: 'big-number', format: {style: 'decimal', 'percent', or 'currency'}, caption?}; currency also requires format.currency (e.g. 'USD'). Big numbers require one metric, dimensions: [], and timeDimension: null. For row@1, use {children: [notebook blocks], widths?: [relative column weights]}. Widths are integers from 1 to 100, in child order (e.g. [3, 1]); missing weights default to 1. To stack blocks in a column, set direction: 'vertical' and omit widths. For table@1, use {columns: [label], rows: [{id, cells: [string or number]}]}.",
    ),
  content: z.array(z.looseObject({})).optional(),
  markdown: z
    .string()
    .optional()
    .describe("Markdown source for text@1, in place of typed content."),
});
