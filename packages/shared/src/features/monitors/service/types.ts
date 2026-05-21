/** service/types.ts contains the DTO schemas and types for the MonitorService
 * — the input contracts for `create`, `update`, and `list`. */
import { z } from "zod";

import { paginationZod } from "../../../utils/zod";

import {
  MonitorSchema,
  MonitorWriteStatusSchema,
  validateQuery,
  validateThresholdOrder,
} from "../types";

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
 * `status` is narrowed to the caller-settable subset (`error-bad-query` is
 * scheduler-owned).
 */
export const CreateMonitorInputSchema = MonitorSchema.omit({
  ...omitOnWrite,
  id: true,
  updatedBy: true,
})
  .extend({ status: MonitorWriteStatusSchema.default("active") })
  .superRefine(validateQuery)
  .superRefine(validateThresholdOrder);
export type CreateMonitorInput = z.infer<typeof CreateMonitorInputSchema>;

/**
 * UpdateMonitorInputSchema is the input contract for `MonitorService.update`.
 * The caller supplies `id` (target row) and `updatedBy`; `createdBy` is
 * preserved from the existing row. `status` is narrowed to the
 * caller-settable subset.
 */
export const UpdateMonitorInputSchema = MonitorSchema.omit({
  ...omitOnWrite,
  createdBy: true,
})
  .extend({ status: MonitorWriteStatusSchema.default("active") })
  .superRefine(validateQuery)
  .superRefine(validateThresholdOrder);
export type UpdateMonitorInput = z.infer<typeof UpdateMonitorInputSchema>;

/** MonitorListOrderBySchema is the list of fields that we can sort the Monitor collection by. */
export const MonitorListOrderBySchema = z.enum([
  "name",
  "status",
  "severity",
  "severityChangedAt",
  "alertedAt",
  "createdAt",
  "updatedAt",
]);
export type MonitorListOrderBy = z.infer<typeof MonitorListOrderBySchema>;

/** MonitorListInputSchema is the input contract for `MonitorService.list`. */
export const MonitorListInputSchema = z.object({
  projectId: z.string(),
  orderBy: z
    .object({
      column: MonitorListOrderBySchema,
      order: z.enum(["ASC", "DESC"]),
    })
    .nullable(),
  ...paginationZod,
});
export type MonitorListInput = z.infer<typeof MonitorListInputSchema>;
