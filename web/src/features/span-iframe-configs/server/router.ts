import { z } from "zod";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { TRPCError } from "@trpc/server";

const SpanIframeConfigSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  url: z.string().url("Must be a valid URL").refine(
    (url) => url.startsWith("https://"),
    "URL must use HTTPS"
  ),
  spanName: z.string().optional(),
});

const CreateSpanIframeConfigSchema = SpanIframeConfigSchema.extend({
  projectId: z.string(),
});

const UpdateSpanIframeConfigSchema = SpanIframeConfigSchema.extend({
  id: z.string(),
  projectId: z.string(),
});

export const spanIframeConfigRouter = createTRPCRouter({
  create: protectedProjectProcedure
    .input(CreateSpanIframeConfigSchema)
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "integrations:CRUD",
      });

      // Check if name already exists for this project
      const existing = await ctx.prisma.spanIframeConfig.findFirst({
        where: {
          projectId: input.projectId,
          name: input.name,
        },
      });

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A configuration with this name already exists",
        });
      }

      const config = await ctx.prisma.spanIframeConfig.create({
        data: {
          projectId: input.projectId,
          name: input.name,
          description: input.description,
          url: input.url,
          spanName: input.spanName,
        },
      });

      await auditLog({
        session: ctx.session,
        resourceType: "spanIframeConfig",
        resourceId: config.id,
        action: "create",
      });

      return config;
    }),

  update: protectedProjectProcedure
    .input(UpdateSpanIframeConfigSchema)
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "integrations:CRUD",
      });

      // Check if another config with the same name exists (excluding current)
      const existing = await ctx.prisma.spanIframeConfig.findFirst({
        where: {
          projectId: input.projectId,
          name: input.name,
          id: { not: input.id },
        },
      });

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A configuration with this name already exists",
        });
      }

      const currentConfig = await ctx.prisma.spanIframeConfig.findUnique({
        where: {
          id: input.id,
        },
      });

      const config = await ctx.prisma.spanIframeConfig.update({
        where: {
          id: input.id,
          projectId: input.projectId,
        },
        data: {
          name: input.name,
          description: input.description,
          url: input.url,
          spanName: input.spanName,
        },
      });

      await auditLog({
        session: ctx.session,
        resourceType: "spanIframeConfig",
        resourceId: config.id,
        before: currentConfig,
        action: "update",
      });

      return config;
    }),

  delete: protectedProjectProcedure
    .input(
      z.object({
        id: z.string(),
        projectId: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "integrations:CRUD",
      });

      const config = await ctx.prisma.spanIframeConfig.findUnique({
        where: {
          id: input.id,
          projectId: input.projectId,
        },
      });

      if (!config) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Configuration not found",
        });
      }

      await ctx.prisma.spanIframeConfig.delete({
        where: {
          id: input.id,
          projectId: input.projectId,
        },
      });

      await auditLog({
        session: ctx.session,
        resourceType: "spanIframeConfig",
        resourceId: input.id,
        before: config,
        action: "delete",
      });

      return { success: true };
    }),

  all: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
      })
    )
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "integrations:CRUD",
      });

      const configs = await ctx.prisma.spanIframeConfig.findMany({
        where: {
          projectId: input.projectId,
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      return configs;
    }),

  byId: protectedProjectProcedure
    .input(
      z.object({
        id: z.string(),
        projectId: z.string(),
      })
    )
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "integrations:CRUD",
      });

      const config = await ctx.prisma.spanIframeConfig.findUnique({
        where: {
          id: input.id,
          projectId: input.projectId,
        },
      });

      if (!config) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Configuration not found",
        });
      }

      return config;
    }),

  // Get applicable configurations for a specific span
  forSpan: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        spanName: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "integrations:CRUD",
      });

      const configs = await ctx.prisma.spanIframeConfig.findMany({
        where: {
          projectId: input.projectId,
          OR: [
            { spanName: null }, // Global configs
            { spanName: input.spanName }, // Matching span name
          ],
        },
        orderBy: [
          { spanName: "desc" }, // Specific span configs first
          { createdAt: "desc" },
        ],
      });

      return configs;
    }),
});

export type SpanIframeConfigRouter = typeof spanIframeConfigRouter;