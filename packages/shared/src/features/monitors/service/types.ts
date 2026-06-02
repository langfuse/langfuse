/** service/types.ts contains the DTOs, schemas, and errors for the MonitorService. */
import { z } from "zod";

import { LangfuseNotFoundError } from "../../../errors";
import { paginationZod } from "../../../utils/zod";

import {
  MonitorSchema,
  MonitorSeveritySchema,
  MonitorWriteStatusSchema,
  validateMonitorQuery,
  validateThresholdOrder,
} from "../types";

/** MonitorNotFoundError is thrown when a monitor row doesn't exist in the project. */
export class MonitorNotFoundError extends LangfuseNotFoundError {
  constructor(monitorId: string, projectId: string) {
    super(`Monitor ${monitorId} not found in project ${projectId}`);
  }
}

/** SessionContext identifies the authenticated caller. */
export const SessionContextSchema = z.object({
  userId: z.string(),
});
export type SessionContext = z.infer<typeof SessionContextSchema>;

/** omitOnWrite are the Monitor fields the service owns and clients can't set. */
const omitOnWrite = {
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  updatedBy: true,
  severity: true,
  severityChangedAt: true,
  alertedAt: true,
  nextRunAt: true,
  lastPublishedAt: true,
  lastClaimedAt: true,
  lastCompletedAt: true,
} as const;

/** CreateMonitorSchema is the input for MonitorService.create. */
export const CreateMonitorSchema = MonitorSchema.omit({
  ...omitOnWrite,
  id: true,
})
  .extend({ status: MonitorWriteStatusSchema.default("ACTIVE") })
  .superRefine(validateMonitorQuery)
  .superRefine(validateThresholdOrder);
export type CreateMonitor = z.infer<typeof CreateMonitorSchema>;

/** UpdateMonitorSchema is the input for MonitorService.update. */
export const UpdateMonitorSchema = MonitorSchema.omit(omitOnWrite)
  // status has no default: a default would un-pause a monitor on a form save.
  .extend({ status: MonitorWriteStatusSchema.optional() })
  .superRefine(validateMonitorQuery)
  .superRefine(validateThresholdOrder);
export type UpdateMonitor = z.infer<typeof UpdateMonitorSchema>;

/** GetMonitorByIdSchema is the input for MonitorService.getById. */
export const GetMonitorByIdSchema = z.object({
  projectId: z.string(),
  id: z.string(),
});
export type GetMonitorById = z.infer<typeof GetMonitorByIdSchema>;

/** DeleteMonitorSchema is the input for MonitorService.delete. */
export const DeleteMonitorSchema = z.object({
  projectId: z.string(),
  id: z.string(),
});
export type DeleteMonitor = z.infer<typeof DeleteMonitorSchema>;

/** GetMonitorFilterOptionsSchema is the input for MonitorService.getFilterOptions. */
export const GetMonitorFilterOptionsSchema = z.object({
  projectId: z.string(),
});
export type GetMonitorFilterOptions = z.infer<
  typeof GetMonitorFilterOptionsSchema
>;

/** MonitorListOrderBySchema is the set of columns MonitorService.list can sort by. */
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

/** ListMonitorSeverityFilterSchema is the severity row of a ListMonitorFilter. */
export const ListMonitorSeverityFilterSchema = z.object({
  type: z.literal("stringOptions"),
  column: z.literal("severity"),
  operator: z.enum(["any of", "none of"]),
  value: z.array(MonitorSeveritySchema).min(1),
});
export type ListMonitorSeverityFilter = z.infer<
  typeof ListMonitorSeverityFilterSchema
>;

/** ListMonitorTagsFilterSchema is the tags row of a ListMonitorFilter. */
export const ListMonitorTagsFilterSchema = z.object({
  type: z.literal("arrayOptions"),
  column: z.literal("tags"),
  operator: z.enum(["any of", "all of", "none of"]),
  value: z.array(z.string()),
});
export type ListMonitorTagsFilter = z.infer<typeof ListMonitorTagsFilterSchema>;

/** ErrorListMonitorFilterDuplicateColumn is the message for a repeated column. */
export const ErrorListMonitorFilterDuplicateColumn =
  "Each column may appear at most once in a ListMonitorFilter";

/** ListMonitorFilterSchema is the typed subset of `singleFilter[]` accepted by MonitorService.list. */
export const ListMonitorFilterSchema = z
  .array(
    z.discriminatedUnion("column", [
      ListMonitorSeverityFilterSchema,
      ListMonitorTagsFilterSchema,
    ]),
  )
  .refine((rows) => new Set(rows.map((r) => r.column)).size === rows.length, {
    message: ErrorListMonitorFilterDuplicateColumn,
  });
export type ListMonitorFilter = z.infer<typeof ListMonitorFilterSchema>;

/** ListMonitorsSchema is the input for MonitorService.list. */
export const ListMonitorsSchema = z.object({
  projectId: z.string(),
  orderBy: z
    .object({
      column: MonitorListOrderBySchema,
      order: z.enum(["ASC", "DESC"]),
    })
    .nullable(),
  filter: ListMonitorFilterSchema.optional(),
  ...paginationZod,
});
export type ListMonitors = z.infer<typeof ListMonitorsSchema>;
