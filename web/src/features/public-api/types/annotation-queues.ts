import { z } from "zod/v4";
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

export const AnnotationQueueItemSchema = z
  .object({
    id: z.string(),
    queueId: z.string(),
    objectId: z.string(),
    objectType: z.enum(AnnotationQueueObjectType),
    status: z.enum(AnnotationQueueStatus),
    completedAt: z.coerce.date().nullable(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();

export const AnnotationQueueSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    scoreConfigIds: z.array(z.string()),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();

export type AnnotationQueueItem = z.infer<typeof AnnotationQueueItemSchema>;
export type AnnotationQueue = z.infer<typeof AnnotationQueueSchema>;

/**
 * Endpoints
 */

// GET /annotation-queues
export const GetAnnotationQueuesQuery = z
  .object({
    ...publicApiPaginationZod,
  })
  .strict();

export const GetAnnotationQueuesResponse = z
  .object({
    data: z.array(AnnotationQueueSchema),
    meta: paginationMetaResponseZod,
  })
  .strict();

// GET /annotation-queues/:queueId
export const GetAnnotationQueueByIdQuery = z
  .object({
    queueId: z.string(),
  })
  .strict();

export const GetAnnotationQueueByIdResponse = AnnotationQueueSchema;

// GET /annotation-queues/:queueId/items
export const GetAnnotationQueueItemsQuery = z
  .object({
    ...publicApiPaginationZod,
    queueId: z.string(),
    status: z.enum(AnnotationQueueStatus).optional(),
  })
  .strict();

export const GetAnnotationQueueItemsResponse = z
  .object({
    data: z.array(AnnotationQueueItemSchema),
    meta: paginationMetaResponseZod,
  })
  .strict();

// GET /annotation-queues/:queueId/items/:itemId
export const GetAnnotationQueueItemByIdQuery = z
  .object({
    queueId: z.string(),
    itemId: z.string(),
  })
  .strict();

export const GetAnnotationQueueItemByIdResponse = AnnotationQueueItemSchema;

// POST /annotation-queues/:queueId/items
export const CreateAnnotationQueueItemBody = z
  .object({
    objectId: z.string(),
    objectType: z.enum(AnnotationQueueObjectType),
    status: z
      .enum(AnnotationQueueStatus)
      .optional()
      .default(AnnotationQueueStatus.PENDING),
  })
  .strict();

export const CreateAnnotationQueueItemResponse = AnnotationQueueItemSchema;

// PATCH /annotation-queues/:queueId/items/:itemId
export const UpdateAnnotationQueueItemBody = z
  .object({
    status: z.enum(AnnotationQueueStatus).optional(),
  })
  .strict();

export const UpdateAnnotationQueueItemResponse = AnnotationQueueItemSchema;

// DELETE /annotation-queues/:queueId/items/:itemId
export const DeleteAnnotationQueueItemQuery = z
  .object({
    queueId: z.string(),
    itemId: z.string(),
  })
  .strict();

export const DeleteAnnotationQueueItemResponse = z
  .object({
    success: z.boolean(),
    message: z.string(),
  })
  .strict();
