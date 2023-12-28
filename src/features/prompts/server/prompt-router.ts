import { z } from "zod";

import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { throwIfNoAccess } from "@/src/features/rbac/utils/checkAccess";
import { type PrismaClient } from "@prisma/client";

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
      return ctx.prisma.prompt.findMany({
        where: {
          projectId: input.projectId,
        },
        orderBy: [{ name: "asc" }, { version: "desc" }],
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
    take: 1,
  });

  const latestActivePrompt = await prisma.prompt.findFirst({
    where: {
      projectId: projectId,
      name: name,
      isActive: true,
    },
    orderBy: [{ version: "desc" }],
    take: 1,
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
  if (latestActivePrompt)
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
