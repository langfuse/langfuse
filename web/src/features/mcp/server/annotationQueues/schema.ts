import { z } from "zod";
import {
  AnnotationQueueAssignmentQuery,
  CreateAnnotationQueueAssignmentBody,
  CreateAnnotationQueueItemBody,
  DeleteAnnotationQueueAssignmentBody,
  GetAnnotationQueueItemByIdQuery,
  UpdateAnnotationQueueItemBody,
} from "@/src/features/public-api/server";

export const CreateAnnotationQueueItemToolSchema = z
  .object({
    queueId: z.string(),
  })
  .extend(CreateAnnotationQueueItemBody.shape);

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
