import { z } from "zod";
import {
  AnnotationQueueStatus,
  InvalidRequestError,
  LangfuseNotFoundError,
  MethodNotAllowedError,
  Prisma as SharedPrisma,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { getUserProjectRoles } from "@langfuse/shared/src/server";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import {
  AnnotationQueueAssignmentQuery,
  CreateAnnotationQueueAssignmentBody,
  CreateAnnotationQueueAssignmentResponse,
  CreateAnnotationQueueBody,
  CreateAnnotationQueueItemBody,
  CreateAnnotationQueueItemResponse,
  CreateAnnotationQueueResponse,
  DeleteAnnotationQueueAssignmentBody,
  DeleteAnnotationQueueAssignmentResponse,
  DeleteAnnotationQueueItemQuery,
  DeleteAnnotationQueueItemResponse,
  GetAnnotationQueueByIdQuery,
  GetAnnotationQueueByIdResponse,
  GetAnnotationQueueItemByIdQuery,
  GetAnnotationQueueItemByIdResponse,
  GetAnnotationQueueItemsQuery,
  GetAnnotationQueueItemsResponse,
  GetAnnotationQueuesQuery,
  GetAnnotationQueuesResponse,
  UpdateAnnotationQueueItemBody,
  UpdateAnnotationQueueItemResponse,
} from "@/src/features/public-api/types/annotation-queues";
import { defineTool } from "../../core/define-tool";
import type { RegisteredTool } from "../../server/registry";
import {
  getMcpPublicApiAuth,
  paginationMeta,
  runPublicApiTool,
} from "../publicApi";

const annotationQueueToApi = (queue: {
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

const annotationQueueItemToApi = (item: {
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

const verifyAnnotationQueue = async ({
  projectId,
  queueId,
}: {
  projectId: string;
  queueId: string;
}) => {
  const queue = await prisma.annotationQueue.findUnique({
    where: {
      id: queueId,
      projectId,
    },
  });

  if (!queue) {
    throw new LangfuseNotFoundError("Annotation queue not found");
  }

  return queue;
};

export const [listAnnotationQueuesTool, handleListAnnotationQueues] =
  defineTool({
    name: "listAnnotationQueues",
    description:
      "List annotation queues in the current Langfuse project with public API pagination.",
    baseSchema: GetAnnotationQueuesQuery,
    inputSchema: GetAnnotationQueuesQuery,
    handler: async (input, context) =>
      runPublicApiTool({
        spanName: "mcp.annotation_queues.list",
        context,
        attributes: {
          "mcp.pagination_page": input.page,
          "mcp.pagination_limit": input.limit,
        },
        fn: async () => {
          const [queues, totalItems] = await Promise.all([
            prisma.annotationQueue.findMany({
              where: { projectId: context.projectId },
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
              take: input.limit,
              skip: (input.page - 1) * input.limit,
            }),
            prisma.annotationQueue.count({
              where: { projectId: context.projectId },
            }),
          ]);

          return GetAnnotationQueuesResponse.parse({
            data: queues.map(annotationQueueToApi),
            meta: paginationMeta({
              page: input.page,
              limit: input.limit,
              totalItems,
            }),
          });
        },
      }),
    readOnlyHint: true,
  });

export const [createAnnotationQueueTool, handleCreateAnnotationQueue] =
  defineTool({
    name: "createAnnotationQueue",
    description:
      "Create an annotation queue in the current Langfuse project via the public API contract.",
    baseSchema: CreateAnnotationQueueBody,
    inputSchema: CreateAnnotationQueueBody,
    handler: async (input, context) =>
      runPublicApiTool({
        spanName: "mcp.annotation_queues.create",
        context,
        attributes: { "mcp.annotation_queue_name": input.name },
        fn: async () => {
          const auth = await getMcpPublicApiAuth(context);

          if (auth.scope.plan === "cloud:hobby") {
            const queueCount = await prisma.annotationQueue.count({
              where: { projectId: context.projectId },
            });

            if (queueCount >= 1) {
              throw new MethodNotAllowedError(
                "Maximum number of annotation queues reached on Hobby plan.",
              );
            }
          }

          const existingQueue = await prisma.annotationQueue.findFirst({
            where: {
              projectId: context.projectId,
              name: input.name,
            },
          });

          if (existingQueue) {
            throw new InvalidRequestError(
              "A queue with this name already exists.",
            );
          }

          const scoreConfigs = await prisma.scoreConfig.findMany({
            where: {
              id: { in: input.scoreConfigIds },
              projectId: context.projectId,
            },
            select: { id: true },
          });
          const scoreConfigIdSet = new Set(
            scoreConfigs.map((config) => config.id),
          );

          if (input.scoreConfigIds.some((id) => !scoreConfigIdSet.has(id))) {
            throw new InvalidRequestError(
              "At least one of the score config IDs cannot be found for the given project.",
            );
          }

          const queue = await prisma.annotationQueue.create({
            data: {
              projectId: context.projectId,
              name: input.name,
              description: input.description,
              scoreConfigIds: input.scoreConfigIds,
            },
          });

          await auditLog({
            action: "create",
            resourceType: "annotationQueue",
            resourceId: queue.id,
            projectId: context.projectId,
            orgId: context.orgId,
            apiKeyId: context.apiKeyId,
            after: queue,
          });

          return CreateAnnotationQueueResponse.parse(
            annotationQueueToApi(queue),
          );
        },
      }),
  });

export const [getAnnotationQueueTool, handleGetAnnotationQueue] = defineTool({
  name: "getAnnotationQueue",
  description: "Get an annotation queue by ID from the current project.",
  baseSchema: GetAnnotationQueueByIdQuery,
  inputSchema: GetAnnotationQueueByIdQuery,
  handler: async (input, context) =>
    runPublicApiTool({
      spanName: "mcp.annotation_queues.get",
      context,
      attributes: { "mcp.annotation_queue_id": input.queueId },
      fn: async () => {
        const queue = await verifyAnnotationQueue({
          projectId: context.projectId,
          queueId: input.queueId,
        });

        return GetAnnotationQueueByIdResponse.parse(
          annotationQueueToApi(queue),
        );
      },
    }),
  readOnlyHint: true,
});

export const [listAnnotationQueueItemsTool, handleListAnnotationQueueItems] =
  defineTool({
    name: "listAnnotationQueueItems",
    description:
      "List items in an annotation queue with optional status filtering.",
    baseSchema: GetAnnotationQueueItemsQuery,
    inputSchema: GetAnnotationQueueItemsQuery,
    handler: async (input, context) =>
      runPublicApiTool({
        spanName: "mcp.annotation_queue_items.list",
        context,
        attributes: {
          "mcp.annotation_queue_id": input.queueId,
          "mcp.pagination_page": input.page,
          "mcp.pagination_limit": input.limit,
        },
        fn: async () => {
          await verifyAnnotationQueue({
            projectId: context.projectId,
            queueId: input.queueId,
          });

          const where = {
            projectId: context.projectId,
            queueId: input.queueId,
            ...(input.status ? { status: input.status } : {}),
          };

          const [items, totalItems] = await Promise.all([
            prisma.annotationQueueItem.findMany({
              where,
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
              take: input.limit,
              skip: (input.page - 1) * input.limit,
            }),
            prisma.annotationQueueItem.count({ where }),
          ]);

          return GetAnnotationQueueItemsResponse.parse({
            data: items.map(annotationQueueItemToApi),
            meta: paginationMeta({
              page: input.page,
              limit: input.limit,
              totalItems,
            }),
          });
        },
      }),
    readOnlyHint: true,
  });

export const [getAnnotationQueueItemTool, handleGetAnnotationQueueItem] =
  defineTool({
    name: "getAnnotationQueueItem",
    description: "Get a single annotation queue item by queue ID and item ID.",
    baseSchema: GetAnnotationQueueItemByIdQuery,
    inputSchema: GetAnnotationQueueItemByIdQuery,
    handler: async (input, context) =>
      runPublicApiTool({
        spanName: "mcp.annotation_queue_items.get",
        context,
        attributes: {
          "mcp.annotation_queue_id": input.queueId,
          "mcp.annotation_queue_item_id": input.itemId,
        },
        fn: async () => {
          await verifyAnnotationQueue({
            projectId: context.projectId,
            queueId: input.queueId,
          });

          const item = await prisma.annotationQueueItem.findUnique({
            where: {
              id: input.itemId,
              queueId: input.queueId,
              projectId: context.projectId,
            },
          });

          if (!item) {
            throw new LangfuseNotFoundError("Annotation queue item not found");
          }

          return GetAnnotationQueueItemByIdResponse.parse(
            annotationQueueItemToApi(item),
          );
        },
      }),
    readOnlyHint: true,
  });

const CreateAnnotationQueueItemToolSchema = z
  .object({
    queueId: z.string(),
  })
  .extend(CreateAnnotationQueueItemBody.shape);

export const [createAnnotationQueueItemTool, handleCreateAnnotationQueueItem] =
  defineTool({
    name: "createAnnotationQueueItem",
    description: "Add an item to an annotation queue.",
    baseSchema: CreateAnnotationQueueItemToolSchema,
    inputSchema: CreateAnnotationQueueItemToolSchema,
    handler: async (input, context) =>
      runPublicApiTool({
        spanName: "mcp.annotation_queue_items.create",
        context,
        attributes: { "mcp.annotation_queue_id": input.queueId },
        fn: async () => {
          await verifyAnnotationQueue({
            projectId: context.projectId,
            queueId: input.queueId,
          });

          const status = input.status || AnnotationQueueStatus.PENDING;
          const completedAt =
            status === AnnotationQueueStatus.COMPLETED ? new Date() : null;

          const item = await prisma.annotationQueueItem.create({
            data: {
              queueId: input.queueId,
              objectId: input.objectId,
              objectType: input.objectType,
              status,
              completedAt,
              projectId: context.projectId,
            },
          });

          await auditLog({
            action: "create",
            resourceType: "annotationQueueItem",
            resourceId: item.id,
            projectId: context.projectId,
            orgId: context.orgId,
            apiKeyId: context.apiKeyId,
            after: item,
          });

          return CreateAnnotationQueueItemResponse.parse(
            annotationQueueItemToApi(item),
          );
        },
      }),
  });

const UpdateAnnotationQueueItemToolSchema =
  GetAnnotationQueueItemByIdQuery.extend(UpdateAnnotationQueueItemBody.shape);

export const [updateAnnotationQueueItemTool, handleUpdateAnnotationQueueItem] =
  defineTool({
    name: "updateAnnotationQueueItem",
    description: "Update an annotation queue item's status.",
    baseSchema: UpdateAnnotationQueueItemToolSchema,
    inputSchema: UpdateAnnotationQueueItemToolSchema,
    handler: async (input, context) =>
      runPublicApiTool({
        spanName: "mcp.annotation_queue_items.update",
        context,
        attributes: {
          "mcp.annotation_queue_id": input.queueId,
          "mcp.annotation_queue_item_id": input.itemId,
        },
        fn: async () => {
          await verifyAnnotationQueue({
            projectId: context.projectId,
            queueId: input.queueId,
          });

          const existingItem = await prisma.annotationQueueItem.findUnique({
            where: {
              id: input.itemId,
              queueId: input.queueId,
              projectId: context.projectId,
            },
          });

          if (!existingItem) {
            throw new LangfuseNotFoundError("Annotation queue item not found");
          }

          const item = await prisma.annotationQueueItem.update({
            where: {
              id: input.itemId,
              queueId: input.queueId,
              projectId: context.projectId,
            },
            data: {
              status: input.status,
              completedAt:
                input.status === AnnotationQueueStatus.COMPLETED
                  ? new Date()
                  : undefined,
            },
          });

          await auditLog({
            action: "update",
            resourceType: "annotationQueueItem",
            resourceId: item.id,
            projectId: context.projectId,
            orgId: context.orgId,
            apiKeyId: context.apiKeyId,
            before: existingItem,
            after: item,
          });

          return UpdateAnnotationQueueItemResponse.parse(
            annotationQueueItemToApi(item),
          );
        },
      }),
  });

export const [deleteAnnotationQueueItemTool, handleDeleteAnnotationQueueItem] =
  defineTool({
    name: "deleteAnnotationQueueItem",
    description: "Remove an item from an annotation queue.",
    baseSchema: DeleteAnnotationQueueItemQuery,
    inputSchema: DeleteAnnotationQueueItemQuery,
    handler: async (input, context) =>
      runPublicApiTool({
        spanName: "mcp.annotation_queue_items.delete",
        context,
        attributes: {
          "mcp.annotation_queue_id": input.queueId,
          "mcp.annotation_queue_item_id": input.itemId,
        },
        fn: async () => {
          await verifyAnnotationQueue({
            projectId: context.projectId,
            queueId: input.queueId,
          });

          const existingItem = await prisma.annotationQueueItem.findUnique({
            where: {
              id: input.itemId,
              queueId: input.queueId,
              projectId: context.projectId,
            },
          });

          if (!existingItem) {
            throw new LangfuseNotFoundError("Annotation queue item not found");
          }

          await prisma.annotationQueueItem.delete({
            where: {
              id: input.itemId,
              queueId: input.queueId,
              projectId: context.projectId,
            },
          });

          await auditLog({
            action: "delete",
            resourceType: "annotationQueueItem",
            resourceId: existingItem.id,
            projectId: context.projectId,
            orgId: context.orgId,
            apiKeyId: context.apiKeyId,
            before: existingItem,
          });

          return DeleteAnnotationQueueItemResponse.parse({
            success: true,
            message: "Annotation queue item deleted successfully",
          });
        },
      }),
    destructiveHint: true,
  });

const CreateAnnotationQueueAssignmentToolSchema =
  AnnotationQueueAssignmentQuery.extend(
    CreateAnnotationQueueAssignmentBody.shape,
  );

export const [
  createAnnotationQueueAssignmentTool,
  handleCreateAnnotationQueueAssignment,
] = defineTool({
  name: "createAnnotationQueueAssignment",
  description: "Assign a project user to an annotation queue.",
  baseSchema: CreateAnnotationQueueAssignmentToolSchema,
  inputSchema: CreateAnnotationQueueAssignmentToolSchema,
  handler: async (input, context) =>
    runPublicApiTool({
      spanName: "mcp.annotation_queue_assignments.create",
      context,
      attributes: { "mcp.annotation_queue_id": input.queueId },
      fn: async () => {
        await verifyAnnotationQueue({
          projectId: context.projectId,
          queueId: input.queueId,
        });

        const user = await getUserProjectRoles({
          projectId: context.projectId,
          orgId: context.orgId,
          filterCondition: [
            {
              column: "userId",
              operator: "any of",
              value: [input.userId],
              type: "stringOptions",
            },
          ],
          searchFilter: SharedPrisma.empty,
          limit: 1,
          page: 0,
          orderBy: SharedPrisma.empty,
        });

        if (!user || user.length === 0) {
          throw new LangfuseNotFoundError(
            "User not found or not authorized for this project",
          );
        }

        const assignment = await prisma.annotationQueueAssignment.upsert({
          where: {
            projectId_queueId_userId: {
              projectId: context.projectId,
              queueId: input.queueId,
              userId: input.userId,
            },
          },
          create: {
            userId: input.userId,
            projectId: context.projectId,
            queueId: input.queueId,
          },
          update: {},
        });

        await auditLog({
          action: "create",
          resourceType: "annotationQueueAssignment",
          resourceId: assignment.id,
          projectId: context.projectId,
          orgId: context.orgId,
          apiKeyId: context.apiKeyId,
          after: assignment,
        });

        return CreateAnnotationQueueAssignmentResponse.parse({
          userId: input.userId,
          projectId: context.projectId,
          queueId: input.queueId,
        });
      },
    }),
});

const DeleteAnnotationQueueAssignmentToolSchema =
  AnnotationQueueAssignmentQuery.extend(
    DeleteAnnotationQueueAssignmentBody.shape,
  );

export const [
  deleteAnnotationQueueAssignmentTool,
  handleDeleteAnnotationQueueAssignment,
] = defineTool({
  name: "deleteAnnotationQueueAssignment",
  description: "Remove a user's assignment from an annotation queue.",
  baseSchema: DeleteAnnotationQueueAssignmentToolSchema,
  inputSchema: DeleteAnnotationQueueAssignmentToolSchema,
  handler: async (input, context) =>
    runPublicApiTool({
      spanName: "mcp.annotation_queue_assignments.delete",
      context,
      attributes: { "mcp.annotation_queue_id": input.queueId },
      fn: async () => {
        await verifyAnnotationQueue({
          projectId: context.projectId,
          queueId: input.queueId,
        });

        try {
          const assignment = await prisma.annotationQueueAssignment.delete({
            where: {
              projectId_queueId_userId: {
                projectId: context.projectId,
                queueId: input.queueId,
                userId: input.userId,
              },
            },
          });

          await auditLog({
            action: "delete",
            resourceType: "annotationQueueAssignment",
            resourceId: assignment.id,
            projectId: context.projectId,
            orgId: context.orgId,
            apiKeyId: context.apiKeyId,
            before: assignment,
          });
        } catch (error) {
          if (
            error &&
            typeof error === "object" &&
            "code" in error &&
            error.code !== "P2025"
          ) {
            throw error;
          }
        }

        return DeleteAnnotationQueueAssignmentResponse.parse({
          success: true,
        });
      },
    }),
  destructiveHint: true,
});

export const annotationQueueTools = [
  {
    definition: listAnnotationQueuesTool,
    handler: handleListAnnotationQueues,
    allowInAppAgentKey: true,
  },
  {
    definition: createAnnotationQueueTool,
    handler: handleCreateAnnotationQueue,
  },
  {
    definition: getAnnotationQueueTool,
    handler: handleGetAnnotationQueue,
    allowInAppAgentKey: true,
  },
  {
    definition: listAnnotationQueueItemsTool,
    handler: handleListAnnotationQueueItems,
    allowInAppAgentKey: true,
  },
  {
    definition: getAnnotationQueueItemTool,
    handler: handleGetAnnotationQueueItem,
    allowInAppAgentKey: true,
  },
  {
    definition: createAnnotationQueueItemTool,
    handler: handleCreateAnnotationQueueItem,
  },
  {
    definition: updateAnnotationQueueItemTool,
    handler: handleUpdateAnnotationQueueItem,
  },
  {
    definition: deleteAnnotationQueueItemTool,
    handler: handleDeleteAnnotationQueueItem,
  },
  {
    definition: createAnnotationQueueAssignmentTool,
    handler: handleCreateAnnotationQueueAssignment,
  },
  {
    definition: deleteAnnotationQueueAssignmentTool,
    handler: handleDeleteAnnotationQueueAssignment,
  },
] satisfies RegisteredTool[];
