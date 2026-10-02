import { z } from "zod";

/**
 * Loose advanced-filter object shared by MCP tools that accept
 * (column, operator, value) filters (scores, metrics, evaluation rules).
 *
 * Kept union-free so it survives MCP JSON-schema discovery (see
 * `define-tool.ts`); each tool validates the precise per-column shape in its
 * own `inputSchema`. `type` is the filter-kind discriminator and `key` targets
 * object columns such as `metadata`.
 *
 * Note: `listObservations` intentionally uses a narrower variant (`type`
 * optional, no `key`) because it infers the type from the column.
 */
export const McpAdvancedFilterBaseSchema = z.object({
  column: z.string(),
  operator: z.string(),
  value: z.any(),
  type: z.string(),
  key: z.string().optional(),
});
