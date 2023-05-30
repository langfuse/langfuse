import { generateKeySet } from "@/src/features/publicApi/lib/apiKeys";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import * as z from "zod";

export const apiKeysRouter = createTRPCRouter({
  byProjectId: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
      })
    )
    .query(async ({ input, ctx }) =>
      ctx.prisma.apiKey.findMany({
        where: {
          projectId: input.projectId,
        },
        select: {
          id: true,
          createdAt: true,
          expiresAt: true,
          lastUsedAt: true,
          note: true,
          publishableKey: true,
          displaySecretKey: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      })
    ),
  create: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        note: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { pk, sk, hashedSk, displaySk } = await generateKeySet();

      const apiKey = await ctx.prisma.apiKey.create({
        data: {
          projectId: input.projectId,
          publishableKey: pk,
          hashedSecretKey: hashedSk,
          displaySecretKey: displaySk,
          note: input.note,
        },
      });

      return {
        id: apiKey.id,
        createdAt: apiKey.createdAt,
        note: input.note,
        publishableKey: apiKey.publishableKey,
        secretKey: sk,
        displaySecretKey: displaySk,
      };
    }),
  delete: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        id: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await ctx.prisma.apiKey.delete({
        where: {
          id: input.id,
        },
      });

      return true;
    }),
});
