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

export const annotationQueueToApi = (queue: {
  id: string;
  name: string;
  description: string | null;
  scoreConfigIds: string[];
  createdAt: Date;
  updatedAt: Date;
}) => ({
  id: queue.id,
  name: queue.name,
  description: queue.description,
  scoreConfigIds: queue.scoreConfigIds,
  createdAt: queue.createdAt,
  updatedAt: queue.updatedAt,
});

export const annotationQueueItemToApi = (item: {
  id: string;
  queueId: string;
  objectId: string;
  objectType: "TRACE" | "OBSERVATION" | "SESSION";
  status: "PENDING" | "COMPLETED";
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) => ({
  id: item.id,
  queueId: item.queueId,
  objectId: item.objectId,
  objectType: item.objectType,
  status: item.status,
  completedAt: item.completedAt,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});
