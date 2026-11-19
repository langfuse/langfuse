import { z } from "zod";
import {
  AnnotationQueueAssignmentQuery,
  CreateAnnotationQueueAssignmentBody,
  CreateAnnotationQueueItemBody,
  DeleteAnnotationQueueAssignmentBody,
  GetAnnotationQueueItemByIdQuery,
  UpdateAnnotationQueueItemBody,
} from "@/src/features/public-api/types/annotation-queues";

export const CreateAnnotationQueueItemToolSchema = z
  .object({
    queueId: z.string(),
  })
  .extend(CreateAnnotationQueueItemBody.shape);

export const MAX_BATCH_CREATE_ANNOTATION_QUEUE_ITEMS = 10;

export const BatchCreateAnnotationQueueItemsToolSchema = z.object({
  queueId: z.string(),
  items: z
    .array(CreateAnnotationQueueItemBody)
    .min(1)
    .max(MAX_BATCH_CREATE_ANNOTATION_QUEUE_ITEMS),
});

export const UpdateAnnotationQueueItemToolSchema =
  GetAnnotationQueueItemByIdQuery.extend(UpdateAnnotationQueueItemBody.shape);

export const CreateAnnotationQueueAssignmentToolSchema =
  AnnotationQueueAssignmentQuery.extend(
    CreateAnnotationQueueAssignmentBody.shape,
  );

export const DeleteAnnotationQueueAssignmentToolSchema =
  AnnotationQueueAssignmentQuery.extend(
    DeleteAnnotationQueueAssignmentBody.shape,
  );
