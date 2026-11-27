import { z } from "zod";
import {
  AnnotationQueueObjectType,
  AnnotationQueueStatus,
} from "@langfuse/shared";
import {
  AnnotationQueueAssignmentQuery,
  CreateAnnotationQueueAssignmentBody,
  CreateAnnotationQueueItemBody,
  DeleteAnnotationQueueAssignmentBody,
  GetAnnotationQueueItemByIdQuery,
  UpdateAnnotationQueueItemBody,
} from "@/src/features/public-api/types/annotation-queues";

const queueIdDescription =
  "Queue ID from listAnnotationQueues or createAnnotationQueue.";

/** Advertised shape of one item to add; runtime validation uses CreateAnnotationQueueItemBody, which defaults status to PENDING. */
const CreateAnnotationQueueItemBaseBody = z
  .object({
    objectId: z
      .string()
      .describe("Trace, observation, or session ID, matching objectType."),
    objectType: z.enum(AnnotationQueueObjectType),
    status: z
      .enum(AnnotationQueueStatus)
      .optional()
      .describe("Default PENDING."),
  })
  .strict();

export const CreateAnnotationQueueItemToolBaseSchema = z
  .object({
    queueId: z.string().describe(queueIdDescription),
  })
  .extend(CreateAnnotationQueueItemBaseBody.shape);

export const CreateAnnotationQueueItemToolSchema = z
  .object({
    queueId: z.string(),
  })
  .extend(CreateAnnotationQueueItemBody.shape);

export const MAX_BATCH_CREATE_ANNOTATION_QUEUE_ITEMS = 10;

export const BatchCreateAnnotationQueueItemsToolBaseSchema = z.object({
  queueId: z.string().describe(queueIdDescription),
  items: z
    .array(CreateAnnotationQueueItemBaseBody)
    .min(1)
    .max(MAX_BATCH_CREATE_ANNOTATION_QUEUE_ITEMS),
});

export const BatchCreateAnnotationQueueItemsToolSchema = z.object({
  queueId: z.string(),
  items: z
    .array(CreateAnnotationQueueItemBody)
    .min(1)
    .max(MAX_BATCH_CREATE_ANNOTATION_QUEUE_ITEMS),
});

export const UpdateAnnotationQueueItemToolSchema =
  GetAnnotationQueueItemByIdQuery.extend(
    UpdateAnnotationQueueItemBody.shape,
  ).extend({
    queueId: GetAnnotationQueueItemByIdQuery.shape.queueId.describe(
      "Queue ID from listAnnotationQueues.",
    ),
    itemId: GetAnnotationQueueItemByIdQuery.shape.itemId.describe(
      "Queue item ID from listAnnotationQueueItems, not the trace or observation objectId.",
    ),
    status: UpdateAnnotationQueueItemBody.shape.status.describe(
      "COMPLETED sets completedAt to now, overwriting it; PENDING keeps an existing completedAt. Omit to change nothing.",
    ),
  });

const assignmentUserIdDescription =
  "Langfuse user ID (not an email) of a user with project access. No tool lists members: ask the user, or reuse an authorUserId from listComments.";

export const CreateAnnotationQueueAssignmentToolSchema =
  AnnotationQueueAssignmentQuery.extend(
    CreateAnnotationQueueAssignmentBody.shape,
  ).extend({
    queueId:
      AnnotationQueueAssignmentQuery.shape.queueId.describe(queueIdDescription),
    userId: CreateAnnotationQueueAssignmentBody.shape.userId.describe(
      assignmentUserIdDescription,
    ),
  });

export const DeleteAnnotationQueueAssignmentToolSchema =
  AnnotationQueueAssignmentQuery.extend(
    DeleteAnnotationQueueAssignmentBody.shape,
  ).extend({
    queueId:
      AnnotationQueueAssignmentQuery.shape.queueId.describe(queueIdDescription),
    userId: DeleteAnnotationQueueAssignmentBody.shape.userId.describe(
      assignmentUserIdDescription,
    ),
  });
