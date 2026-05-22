/** service/types.ts contains the DTOs, schemas, and errors for the MonitorService. */
import { z } from "zod";

import { LangfuseNotFoundError } from "../../../errors";
import { singleFilter } from "../../../interfaces/filters";
import { paginationZod } from "../../../utils/zod";

import {
  MonitorSchema,
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
  lastPublishedRunAt: true,
  lastCompletedRunAt: true,
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
  .extend({ status: MonitorWriteStatusSchema.default("ACTIVE") })
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

/** ListMonitorsSchema is the input for MonitorService.list. */
export const ListMonitorsSchema = z.object({
  projectId: z.string(),
  orderBy: z
    .object({
      column: MonitorListOrderBySchema,
      order: z.enum(["ASC", "DESC"]),
    })
    .nullable(),
  filter: z.array(singleFilter).optional(),
  ...paginationZod,
});
export type ListMonitors = z.infer<typeof ListMonitorsSchema>;
