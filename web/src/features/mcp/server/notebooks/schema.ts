import { z } from "zod";
import { notebookDocumentId } from "@/src/features/notebooks/schema";

// Tool discovery rejects JSON Schema unions. The notebook codec parses the
// discriminated block and operation schemas when the tool runs.
export const blockDiscoverySchema = z.strictObject({
  id: notebookDocumentId.optional(),
  schema: z.enum(["text@1", "chart@1", "row@1"]),
  props: z
    .looseObject({})
    .optional()
    .describe(
      "For text@1, omit props or use {}. For chart@1, use {title?, query: {schema: 'metrics@2', ...the Metrics V2 query}, display: {kind: 'line' or 'bar'}}. A line chart needs timeDimension. For a KPI, use display: {kind: 'big-number', format: {style: 'decimal', 'percent', or 'currency'}, caption?}; currency also requires format.currency (e.g. 'USD'). Big numbers require one metric, dimensions: [], and timeDimension: null. For row@1, use {children: [notebook blocks]}.",
    ),
  content: z.array(z.looseObject({})).optional(),
  markdown: z
    .string()
    .optional()
    .describe("Markdown source for text@1, in place of typed content."),
});
