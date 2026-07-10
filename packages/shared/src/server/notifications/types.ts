import { EvaluatorBlockReason } from "@prisma/client";
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

/** projectNotificationEventBaseSchema holds the fields shared by every project notification event. */
const projectNotificationEventBaseSchema = z.object({
  severity: ProjectNotificationSeveritySchema,
  projectId: z.string(),
  projectName: z.string(),
  resourceId: z.string(),
  resourceName: z.string(),
  message: z.string(),
  url: z.string().optional(),
});

/**
 * ProjectNotificationEventSchema is the `event` body of the
 * project-notification webhook envelope, discriminated on eventType. It is
 * both the producer input and the outbound wire body. `blockReason` values are
 * the Prisma EvaluatorBlockReason enum and are public API — additive changes
 * are fine, renames are breaking.
 */
export const ProjectNotificationEventSchema = z.discriminatedUnion(
  "eventType",
  [
    projectNotificationEventBaseSchema.extend({
      eventType: z.literal(
        ProjectNotificationEventTypeSchema.enum["blob-export-failed"],
      ),
      // true when the integration was auto-disabled after repeated failures
      // (terminal event; selects the "disabled" email variant).
      disabled: z.boolean().optional(),
    }),
    projectNotificationEventBaseSchema.extend({
      eventType: z.literal(
        ProjectNotificationEventTypeSchema.enum["evaluator-blocked"],
      ),
      blockReason: z.enum(EvaluatorBlockReason),
      evalTemplateId: z.string().optional(),
    }),
  ],
);
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
