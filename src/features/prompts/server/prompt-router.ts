import { z } from "zod";

import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { throwIfNoAccess } from "@/src/features/rbac/utils/checkAccess";
import { type Prompt, type PrismaClient } from "@prisma/client";

export const CreatePrompt = z.object({
  projectId: z.string(),
  name: z.string(),
  isActive: z.boolean(),
  prompt: z.string(),
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
        SELECT id, name, version, project_id as "projectId", prompt, updated_at as "updatedAt", created_at AS "createdAt", is_active AS "isActive"
        FROM prompts
        WHERE (name, version) IN (
          SELECT name, MAX(version)
          FROM prompts
          WHERE "project_id" = ${input.projectId}
          GROUP BY name
        )
        AND "project_id" = ${input.projectId}
        ORDER BY name ASC`;
      return prompts;
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

        return await createPrompt({
          projectId: input.projectId,
          name: input.name,
          prompt: input.prompt,
          isActive: input.isActive,
          createdBy: ctx.session.user.id,
          prisma: ctx.prisma,
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
          throw new Error("User not found for promptId ${p.id}");
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
  prisma,
}: {
  projectId: string;
  name: string;
  prompt: string;
  isActive?: boolean;
  createdBy: string;
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
