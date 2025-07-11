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
  CreateLlmToolInput,
  DeleteLlmToolInput,
  UpdateLlmToolInput,
} from "../validation";

export const llmToolRouter = createTRPCRouter({
  create: protectedProjectProcedure
    .input(CreateLlmToolInput)
    .mutation(async ({ input, ctx }) => {
      try {
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "llmTools:CUD",
        });

        const existingTool = await ctx.prisma.llmTool.findUnique({
          where: {
            projectId_name: {
              projectId: input.projectId,
              name: input.name,
            },
          },
        });

        if (existingTool) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "An LLM Tool with this name already exists in this project",
          });
        }

        const llmTool = await ctx.prisma.llmTool.create({
          data: {
            projectId: input.projectId,
            name: input.name,
            description: input.description,
            parameters: input.parameters as Prisma.InputJsonValue,
          },
        });

        await auditLog({
          session: ctx.session,
          resourceType: "llmTool",
          resourceId: llmTool.id,
          action: "create",
          after: llmTool,
        });

        return llmTool;
      } catch (error) {
        logger.error("Failed to create LLM Tool", error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Creating LLM Tool failed",
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
          scope: "llmTools:read",
        });

        const llmTools = await ctx.prisma.llmTool.findMany({
          where: {
            projectId: input.projectId,
          },
          orderBy: {
            updatedAt: "desc",
          },
        });

        return llmTools;
      } catch (error) {
        logger.error("Failed to get LLM Tools", error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Fetching LLM Tools failed",
        });
      }
    }),

  update: protectedProjectProcedure
    .input(UpdateLlmToolInput)
    .mutation(async ({ input, ctx }) => {
      try {
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "llmTools:CUD",
        });

        const existingTool = await ctx.prisma.llmTool.findUnique({
          where: {
            id: input.id,
            projectId: input.projectId,
          },
        });

        if (!existingTool) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "LLM Tool not found",
          });
        }

        const duplicateNameCheck = await ctx.prisma.llmTool.findFirst({
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
              "Another LLM Tool with this name already exists in this project",
          });
        }

        const updatedTool = await ctx.prisma.llmTool.update({
          where: {
            id: input.id,
            projectId: input.projectId,
          },
          data: {
            name: input.name,
            description: input.description,
            parameters: input.parameters as Prisma.InputJsonValue,
          },
        });

        await auditLog({
          session: ctx.session,
          resourceType: "llmTool",
          resourceId: updatedTool.id,
          action: "update",
          before: existingTool,
          after: updatedTool,
        });

        return updatedTool;
      } catch (error) {
        logger.error("Failed to update LLM Tool", error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Updating LLM Tool failed",
        });
      }
    }),

  delete: protectedProjectProcedure
    .input(DeleteLlmToolInput)
    .mutation(async ({ input, ctx }) => {
      try {
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "llmTools:CUD",
        });

        const existingTool = await ctx.prisma.llmTool.findUnique({
          where: {
            id: input.id,
            projectId: input.projectId,
          },
        });

        if (!existingTool) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "LLM Tool not found",
          });
        }

        await ctx.prisma.llmTool.delete({
          where: {
            id: input.id,
            projectId: input.projectId,
          },
        });

        await auditLog({
          session: ctx.session,
          resourceType: "llmTool",
          resourceId: input.id,
          action: "delete",
          before: existingTool,
        });

        return { success: true };
      } catch (error) {
        logger.error("Failed to delete LLM Tool", error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Deleting LLM Tool failed",
        });
      }
    }),
});
