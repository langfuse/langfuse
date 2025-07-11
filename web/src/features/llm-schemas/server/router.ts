import { type Prisma } from "@langfuse/shared";
import { z } from "zod/v4";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { TRPCError } from "@trpc/server";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { logger } from "@langfuse/shared/src/server";
import {
  CreateLlmSchemaInput,
  DeleteLlmSchemaInput,
  UpdateLlmSchemaInput,
} from "../validation";

export const llmSchemaRouter = createTRPCRouter({
  create: protectedProjectProcedure
    .input(CreateLlmSchemaInput)
    .mutation(async ({ input, ctx }) => {
      try {
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "llmSchemas:CUD",
        });

        const existingSchema = await ctx.prisma.llmSchema.findUnique({
          where: {
            projectId_name: {
              projectId: input.projectId,
              name: input.name,
            },
          },
        });

        if (existingSchema) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "An LLM Schema with this name already exists in this project",
          });
        }

        const llmSchema = await ctx.prisma.llmSchema.create({
          data: {
            projectId: input.projectId,
            name: input.name,
            description: input.description,
            schema: input.schema as Prisma.InputJsonValue,
          },
        });

        await auditLog({
          session: ctx.session,
          resourceType: "llmSchema",
          resourceId: llmSchema.id,
          action: "create",
          after: llmSchema,
        });

        return llmSchema;
      } catch (error) {
        logger.error("Failed to create LLM Schema", error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Creating LLM Schema failed",
        });
      }
    }),

  getAll: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      try {
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "llmSchemas:read",
        });

        const llmSchemas = await ctx.prisma.llmSchema.findMany({
          where: {
            projectId: input.projectId,
          },
          orderBy: {
            updatedAt: "desc",
          },
        });

        return llmSchemas;
      } catch (error) {
        logger.error("Failed to get LLM Schemas", error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Fetching LLM Schemas failed",
        });
      }
    }),

  update: protectedProjectProcedure
    .input(UpdateLlmSchemaInput)
    .mutation(async ({ input, ctx }) => {
      try {
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "llmSchemas:CUD",
        });

        const existingSchema = await ctx.prisma.llmSchema.findUnique({
          where: {
            id: input.id,
            projectId: input.projectId,
          },
        });

        if (!existingSchema) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "LLM Schema not found",
          });
        }

        const duplicateNameCheck = await ctx.prisma.llmSchema.findFirst({
          where: {
            projectId: input.projectId,
            name: input.name,
            id: {
              not: input.id,
            },
          },
        });

        if (duplicateNameCheck) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "Another LLM Schema with this name already exists in this project",
          });
        }

        const updatedSchema = await ctx.prisma.llmSchema.update({
          where: {
            id: input.id,
            projectId: input.projectId,
          },
          data: {
            name: input.name,
            description: input.description,
            schema: input.schema as Prisma.InputJsonValue,
          },
        });

        await auditLog({
          session: ctx.session,
          resourceType: "llmSchema",
          resourceId: updatedSchema.id,
          action: "update",
          before: existingSchema,
          after: updatedSchema,
        });

        return updatedSchema;
      } catch (error) {
        logger.error("Failed to update LLM Schema", error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Updating LLM Schema failed",
        });
      }
    }),

  delete: protectedProjectProcedure
    .input(DeleteLlmSchemaInput)
    .mutation(async ({ input, ctx }) => {
      try {
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "llmSchemas:CUD",
        });

        const existingSchema = await ctx.prisma.llmSchema.findUnique({
          where: {
            id: input.id,
            projectId: input.projectId,
          },
        });

        if (!existingSchema) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "LLM Schema not found",
          });
        }

        await ctx.prisma.llmSchema.delete({
          where: {
            id: input.id,
            projectId: input.projectId,
          },
        });

        await auditLog({
          session: ctx.session,
          resourceType: "llmSchema",
          resourceId: input.id,
          action: "delete",
          before: existingSchema,
        });

        return { success: true };
      } catch (error) {
        logger.error("Failed to delete LLM Schema", error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Deleting LLM Schema failed",
        });
      }
    }),
});
