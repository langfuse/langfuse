import { z } from "zod";

import {
  createTRPCRouter,
  protectedProcedure,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { type Neuron } from "@/src/utils/types";

const NeuronFilterOptions = z.object({
  ownerId: z.array(z.string()).nullable(),
  projectId: z.string(), // Required for protectedProjectProcedure
});

export const neuronsRouter = createTRPCRouter({
  all: protectedProjectProcedure
    .input(NeuronFilterOptions)
    .query(async ({ input, ctx }) => {
      const neurons = (await ctx.prisma.neurons.findMany({
        where: {
          owner: {
            //@ts-ignore
            projectId: input.projectId,
          },
          ...(input.ownerId
            ? {
                ownerId: { in: input.ownerId },
              }
            : undefined),
        },
        orderBy: {
          timestamp: "desc",
        },
        take: 100, // TODO: pagination
      })) as Neuron[];

      return neurons;
    }),

  availableFilterOptions: protectedProjectProcedure
    .input(NeuronFilterOptions)
    .query(async ({ input, ctx }) => {
      const filter = {
        owner: {
          projectId: input.projectId,
        },
        ...(input.ownerId
          ? {
              ownerId: { in: input.ownerId },
            }
          : undefined),
      };

      const ownerIds = await ctx.prisma.neurons.groupBy({
        //@ts-ignore
        where: filter,
        by: ["ownerId"],
        _count: {
          _all: true,
        },
      });

      return [
        {
          key: "ownerId",
          occurrences: ownerIds.map((i) => {
            return { key: i.ownerId, count: i._count };
          }),
        },
      ];
    }),
  byId: protectedProcedure.input(z.string()).query(async ({ input, ctx }) => {
    const neuron = (await ctx.prisma.neurons.findFirstOrThrow({
      where: {
        id: input,
        owner: {
        //@ts-ignore
          project: {
            members: {
              some: {
                userId: ctx.session.user.id,
              },
            },
          },
        },
      },
    })) as Neuron;

    return neuron;
  }),
});