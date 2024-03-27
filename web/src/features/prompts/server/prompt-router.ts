import { z } from "zod";

import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { throwIfNoAccess } from "@/src/features/rbac/utils/checkAccess";
import { type Prompt, type PrismaClient } from "@langfuse/shared/src/db";
import { jsonSchema } from "@/src/utils/zod";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { DB } from "@/src/server/db";

export const CreatePrompt = z.object({
  projectId: z.string(),
  name: z.string(),
  isActive: z.boolean(),
  prompt: z.string(),
  config: jsonSchema,
});

export const promptRouter = createTRPCRouter({
  all: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "prompts:read",
      });

      const prompts = await ctx.prisma.$queryRaw<Array<Prompt>>`
        SELECT 
          id, 
          name, 
          version, 
          project_id AS "projectId", 
          prompt, 
          updated_at AS "updatedAt", 
          created_at AS "createdAt", 
          is_active AS "isActive"
        FROM prompts
        WHERE (name, version) IN (
          SELECT name, MAX(version)
          FROM prompts
          WHERE "project_id" = ${input.projectId}
          GROUP BY name
        )
        AND "project_id" = ${input.projectId}
        ORDER BY name ASC`;

      const promptCountQuery = DB.selectFrom("observations")
        .fullJoin("prompts", "prompts.id", "observations.prompt_id")
        .select(({ fn }) => [
          "prompts.name",
          fn.count("observations.id").as("count"),
        ])
        .where("prompts.project_id", "=", input.projectId)
        .where("observations.project_id", "=", input.projectId)
        .groupBy("prompts.name");

      const compiledQuery = promptCountQuery.compile();

      const promptCounts = await ctx.prisma.$queryRawUnsafe<
        Array<{
          name: string;
          count: bigint;
        }>
      >(compiledQuery.sql, ...compiledQuery.parameters);

      const joinedPromptsAndCounts = prompts.map((p) => {
        const marchedCount = promptCounts.find((c) => c.name === p.name);
        return {
          ...p,
          observationCount: marchedCount?.count ?? 0,
        };
      });

      return joinedPromptsAndCounts;
    }),
  byId: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        id: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "prompts:read",
      });
      return ctx.prisma.prompt.findFirst({
        where: {
          id: input.id,
          projectId: input.projectId,
        },
      });
    }),
  create: protectedProjectProcedure
    .input(CreatePrompt)
    .mutation(async ({ input, ctx }) => {
      try {
        throwIfNoAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "prompts:CUD",
        });

        const prompt = await createPrompt({
          projectId: input.projectId,
          name: input.name,
          prompt: input.prompt,
          isActive: input.isActive,
          createdBy: ctx.session.user.id,
          config: jsonSchema.parse(input.config),
          prisma: ctx.prisma,
        });

        if (!prompt) {
          throw new Error("Failed to create prompt");
        }

        await auditLog(
          {
            session: ctx.session,
            resourceType: "prompt",
            resourceId: prompt.id,
            action: "create",
            after: prompt,
          },
          ctx.prisma,
        );

        return prompt;
      } catch (e) {
        console.log(e);
        throw e;
      }
    }),
  delete: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        promptName: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        throwIfNoAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "prompts:CUD",
        });

        // fetch prompts before deletion to enable audit logging
        const prompts = await ctx.prisma.prompt.findMany({
          where: {
            projectId: input.projectId,
            name: input.promptName,
          },
        });

        for (const prompt of prompts) {
          await auditLog(
            {
              session: ctx.session,
              resourceType: "prompt",
              resourceId: prompt.id,
              action: "delete",
              before: prompt,
            },
            ctx.prisma,
          );
        }

        await ctx.prisma.prompt.deleteMany({
          where: {
            projectId: input.projectId,
            id: {
              in: prompts.map((p) => p.id),
            },
          },
        });
      } catch (e) {
        console.log(e);
        throw e;
      }
    }),
  deleteVersion: protectedProjectProcedure
    .input(
      z.object({
        promptVersionId: z.string(),
        projectId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        throwIfNoAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "prompts:CUD",
        });

        const promptVersion = await ctx.prisma.prompt.findFirstOrThrow({
          where: {
            id: input.promptVersionId,
            projectId: input.projectId,
          },
        });

        await auditLog(
          {
            session: ctx.session,
            resourceType: "prompt",
            resourceId: input.promptVersionId,
            action: "delete",
            before: promptVersion,
          },
          ctx.prisma,
        );

        await ctx.prisma.prompt.delete({
          where: {
            id: input.promptVersionId,
            projectId: input.projectId,
          },
        });
      } catch (e) {
        console.log(e);
        throw e;
      }
    }),
  promote: protectedProjectProcedure
    .input(z.object({ promptId: z.string(), projectId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      try {
        throwIfNoAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "prompts:CUD",
        });

        const toBePromotedPrompt = await ctx.prisma.prompt.findUniqueOrThrow({
          where: {
            id: input.promptId,
          },
        });

        await auditLog(
          {
            session: ctx.session,
            resourceType: "prompt",
            resourceId: toBePromotedPrompt.id,
            action: "promote",
            after: {
              ...toBePromotedPrompt,
              isActive: true,
            },
          },
          ctx.prisma,
        );

        const latestActivePrompt = await ctx.prisma.prompt.findFirst({
          where: {
            projectId: input.projectId,
            name: toBePromotedPrompt.name,
            isActive: true,
          },
          orderBy: [{ version: "desc" }],
        });

        const toBeExecuted = [
          ctx.prisma.prompt.update({
            where: {
              id: toBePromotedPrompt.id,
            },
            data: {
              isActive: true,
            },
          }),
        ];
        if (latestActivePrompt)
          toBeExecuted.push(
            ctx.prisma.prompt.update({
              where: {
                id: latestActivePrompt.id,
              },
              data: {
                isActive: false,
              },
            }),
          );
        await ctx.prisma.$transaction(toBeExecuted);
      } catch (e) {
        console.log(e);
        throw e;
      }
    }),
  allVersions: protectedProjectProcedure
    .input(z.object({ projectId: z.string(), name: z.string() }))
    .query(async ({ input, ctx }) => {
      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "prompts:read",
      });
      const prompts = await ctx.prisma.prompt.findMany({
        where: {
          projectId: input.projectId,
          name: input.name,
        },
        orderBy: [{ version: "desc" }],
      });
      const users = await ctx.prisma.user.findMany({
        select: {
          // never select passwords as they should never be returned to the FE
          id: true,
          name: true,
          email: true,
        },
        where: {
          memberships: {
            some: {
              projectId: input.projectId,
            },
          },
        },
      });

      const joinedPromptAndUsers = prompts.map((p) => {
        const user = users.find((u) => u.id === p.createdBy);
        if (!user && p.createdBy === "API") {
          return { ...p, creator: "API" };
        }
        if (!user) {
          console.log(`User not found for promptId ${p.id}`);
          throw new Error(`User not found for promptId ${p.id}`);
        }
        return {
          ...p,
          creator: user.name,
        };
      });
      return joinedPromptAndUsers;
    }),
});

export const createPrompt = async ({
  projectId,
  name,
  prompt,
  isActive = true,
  createdBy,
  config,
  prisma,
}: {
  projectId: string;
  name: string;
  prompt: string;
  isActive?: boolean;
  createdBy: string;
  config: z.infer<typeof jsonSchema>;
  prisma: PrismaClient;
}) => {
  const latestPrompt = await prisma.prompt.findFirst({
    where: {
      projectId: projectId,
      name: name,
    },
    orderBy: [{ version: "desc" }],
  });

  const latestActivePrompt = await prisma.prompt.findFirst({
    where: {
      projectId: projectId,
      name: name,
      isActive: true,
    },
    orderBy: [{ version: "desc" }],
  });

  const create = [
    prisma.prompt.create({
      data: {
        prompt: prompt,
        name: name,
        version: latestPrompt?.version ? latestPrompt.version + 1 : 1,
        isActive: isActive,
        project: { connect: { id: projectId } },
        createdBy: createdBy,
        config: jsonSchema.parse(config),
      },
    }),
  ];
  if (latestActivePrompt && isActive)
    // If we're creating a new active prompt, we need to deactivate the old one
    create.push(
      prisma.prompt.update({
        where: {
          id: latestActivePrompt.id,
        },
        data: {
          isActive: false,
        },
      }),
    );

  const [createdPrompt] = await prisma.$transaction(create);

  return createdPrompt;
};
