/** service/types.ts contains the DTO schemas and types for the MonitorService
 * — the input contracts for `create`, `update`, and `list`. */
import { z } from "zod";

import { orderBy } from "../../../interfaces/orderBy";
import { paginationZod } from "../../../utils/zod";

import { MonitorSchema, validateQuery, validateThresholdOrder } from "../types";

/**
 * omitOnWrite are the Monitor fields the service generates or owns. They are
 * omitted from every write DTO.
 */
const omitOnWrite = {
  createdAt: true,
  updatedAt: true,
  severity: true,
  severityChangedAt: true,
  alertedAt: true,
  nextRunAt: true,
  lastPublishedRunAt: true,
  lastCompletedRunAt: true,
} as const;

/**
 * CreateMonitorInputSchema is the input contract for `MonitorService.create`.
 * The caller supplies `createdBy`; the service mirrors it onto `updatedBy`.
 */
export const CreateMonitorInputSchema = MonitorSchema.omit({
  ...omitOnWrite,
  id: true,
  updatedBy: true,
})
  .superRefine(validateQuery)
  .superRefine(validateThresholdOrder);
export type CreateMonitorInput = z.infer<typeof CreateMonitorInputSchema>;

/**
 * UpdateMonitorInputSchema is the input contract for `MonitorService.update`.
 * The caller supplies `id` (target row) and `updatedBy`; `createdBy` is
 * preserved from the existing row.
 */
export const UpdateMonitorInputSchema = MonitorSchema.omit({
  ...omitOnWrite,
  createdBy: true,
})
  .superRefine(validateQuery)
  .superRefine(validateThresholdOrder);
export type UpdateMonitorInput = z.infer<typeof UpdateMonitorInputSchema>;

/**
 * MonitorListInputSchema is the input contract for `MonitorService.list`.
 * Null `orderBy` falls back to the service default (`updatedAt DESC`).
 */
export const MonitorListInputSchema = z.object({
  projectId: z.string(),
  orderBy,
  ...paginationZod,
});
export type MonitorListInput = z.infer<typeof MonitorListInputSchema>;
