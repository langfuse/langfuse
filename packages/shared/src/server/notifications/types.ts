import { type EvaluatorBlockReason } from "@prisma/client";
import { z } from "zod";

import {
  ProjectNotificationEventTypeSchema,
  type ProjectNotificationEventType,
} from "../../domain/automations";

export {
  ProjectNotificationEventTypeSchema,
  type ProjectNotificationEventType,
};

/** ProjectNotificationSeveritySchema is the severity vocabulary of project notification events. */
export const ProjectNotificationSeveritySchema = z.enum([
  "ALERT",
  "WARNING",
  "INFO",
]);
export type ProjectNotificationSeverity = z.infer<
  typeof ProjectNotificationSeveritySchema
>;

/** ProjectNotificationEventSchema is the `event` body of the project-notification webhook envelope. */
export const ProjectNotificationEventSchema = z.object({
  eventType: ProjectNotificationEventTypeSchema,
  severity: ProjectNotificationSeveritySchema,
  projectId: z.string(),
  resourceId: z.string(),
  resourceName: z.string(),
  message: z.string(),
  url: z.string().optional(),
});
export type ProjectNotificationEvent = z.infer<
  typeof ProjectNotificationEventSchema
>;

/**
 * ProjectNotificationWebhookQueueEventSchema is the `project-notification`
 * variant of the webhook envelope: the queue payload equals the outbound HTTP
 * body, mirroring monitor-alert. `id` is the executionId, `timestamp` is the
 * dispatch time.
 */
export const ProjectNotificationWebhookQueueEventSchema = z.object({
  id: z.string(),
  timestamp: z.coerce.date(),
  type: z.literal("project-notification"),
  apiVersion: z.literal("v1"),
  event: ProjectNotificationEventSchema,
});
export type ProjectNotificationWebhookQueueEvent = z.infer<
  typeof ProjectNotificationWebhookQueueEventSchema
>;

/**
 * ProjectNotificationDispatchEvent is the producer-side input to
 * dispatchProjectNotification: the wire event plus per-eventType admin-email
 * template data (discriminated on eventType). The extra fields are
 * internal-only and stripped from the outbound webhook body.
 */
export type ProjectNotificationDispatchEvent =
  | (Omit<ProjectNotificationEvent, "eventType"> & {
      eventType: "blob-export-failed";
    })
  | (Omit<ProjectNotificationEvent, "eventType"> & {
      eventType: "evaluator-blocked";
      projectName: string;
      blockReason: EvaluatorBlockReason;
      evalTemplateId?: string;
    });
