import { z } from "zod";

import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { throwIfNoAccess } from "@/src/features/rbac/utils/checkAccess";

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
        include: {
          user: {
            select: {
              email: true,
            },
          },
        },
      });
    }),

  create: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        name: z.string(),
        isActive: z.boolean(),
        prompt: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        throwIfNoAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "prompts:CUD",
        });

        const latestPrompt = await ctx.prisma.prompt.findFirst({
          where: {
            projectId: input.projectId,
            name: input.name,
          },
          orderBy: [{ version: "desc" }],
          take: 1,
        });

        const latestActivePrompt = await ctx.prisma.prompt.findFirst({
          where: {
            projectId: input.projectId,
            name: input.name,
            isActive: true,
          },
          orderBy: [{ version: "desc" }],
          take: 1,
        });

        const create = [
          ctx.prisma.prompt.create({
            data: {
              prompt: input.prompt,
              name: input.name,
              version: latestPrompt?.version ? latestPrompt.version + 1 : 1,
              isActive: input.isActive,
              project: { connect: { id: input.projectId } },
              user: { connect: { id: ctx.session.user.id } },
            },
          }),
        ];
        if (latestActivePrompt)
          create.push(
            ctx.prisma.prompt.update({
              where: {
                id: latestActivePrompt.id,
              },
              data: {
                isActive: false,
              },
            }),
          );

        const [prompt] = await ctx.prisma.$transaction(create);

        return prompt;
      } catch (e) {
        console.log(e);
        throw e;
      }
    }),
});
