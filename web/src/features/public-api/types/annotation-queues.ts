import { z } from "zod";
import {
  paginationMetaResponseZod,
  publicApiPaginationZod,
} from "@langfuse/shared";
import {
  AnnotationQueueObjectType,
  AnnotationQueueStatus,
} from "@langfuse/shared";

/**
 * Common Types
 */

export const AnnotationQueueItemSchema = z.object({
  id: z.string(),
  queueId: z.string(),
  objectId: z.string(),
  objectType: z.nativeEnum(AnnotationQueueObjectType),
  status: z.nativeEnum(AnnotationQueueStatus),
  completedAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const AnnotationQueueSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  scoreConfigIds: z.array(z.string()),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type AnnotationQueueItem = z.infer<typeof AnnotationQueueItemSchema>;
export type AnnotationQueue = z.infer<typeof AnnotationQueueSchema>;

/**
 * Endpoints
 */

// GET /annotation-queues
export const GetAnnotationQueuesQuery = z.object({
  ...publicApiPaginationZod,
});

export const GetAnnotationQueuesResponse = z.object({
  data: z.array(AnnotationQueueSchema),
  meta: paginationMetaResponseZod,
});

// GET /annotation-queues/:queueId
export const GetAnnotationQueueByIdQuery = z.object({
  queueId: z.string(),
});

export const GetAnnotationQueueByIdResponse = AnnotationQueueSchema;

// GET /annotation-queues/:queueId/items
export const GetAnnotationQueueItemsQuery = z.object({
  ...publicApiPaginationZod,
  queueId: z.string(),
  status: z.nativeEnum(AnnotationQueueStatus).optional(),
});

export const GetAnnotationQueueItemsResponse = z.object({
  data: z.array(AnnotationQueueItemSchema),
  meta: paginationMetaResponseZod,
});

// GET /annotation-queues/:queueId/items/:itemId
export const GetAnnotationQueueItemByIdQuery = z.object({
  queueId: z.string(),
  itemId: z.string(),
});

export const GetAnnotationQueueItemByIdResponse = AnnotationQueueItemSchema;

// POST /annotation-queues/:queueId/items
export const CreateAnnotationQueueItemBody = z.object({
  objectId: z.string(),
  objectType: z.nativeEnum(AnnotationQueueObjectType),
  status: z
    .nativeEnum(AnnotationQueueStatus)
    .optional()
    .default(AnnotationQueueStatus.PENDING),
});

export const CreateAnnotationQueueItemResponse = AnnotationQueueItemSchema;

// PATCH /annotation-queues/:queueId/items/:itemId
export const UpdateAnnotationQueueItemBody = z.object({
  status: z.nativeEnum(AnnotationQueueStatus).optional(),
});

export const UpdateAnnotationQueueItemResponse = AnnotationQueueItemSchema;

// DELETE /annotation-queues/:queueId/items/:itemId
export const DeleteAnnotationQueueItemQuery = z.object({
  queueId: z.string(),
  itemId: z.string(),
});

export const DeleteAnnotationQueueItemResponse = z.object({
  success: z.boolean(),
  message: z.string(),
});
