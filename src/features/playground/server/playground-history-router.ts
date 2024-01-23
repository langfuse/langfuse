import {
  availableModelSchema,
  availableModes,
  availableProviderSchema,
} from "@/src/features/playground/types";
import { throwIfNoAccess } from "@/src/features/rbac/utils/checkAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { jsonSchema } from "@/src/utils/zod";
import { z } from "zod";

export const CreatePlaygroundHistory = z.object({
  projectId: z.string(),
  keyId: z.string().optional(),
  mode: z.enum(availableModes),
  model: availableModelSchema,
  provider: availableProviderSchema,
  parameters: jsonSchema,
  input: jsonSchema,
});

export const playgroundHistoryRouter = createTRPCRouter({
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
        scope: "playground:CUD",
      });
      return ctx.prisma.playgroundHistory.findMany({
        where: {
          projectId: input.projectId,
        },
        orderBy: [{ createdAt: "desc" }],
      });
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
        scope: "playground:CUD",
      });
      return ctx.prisma.playgroundHistory.findFirst({
        where: {
          id: input.id,
          projectId: input.projectId,
        },
      });
    }),
  create: protectedProjectProcedure
    .input(CreatePlaygroundHistory)
    .mutation(async ({ input, ctx }) => {
      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "playground:CUD",
      });
      return ctx.prisma.playgroundHistory.create({
        data: {
          projectId: input.projectId,
          userId: ctx.session.user.id,
          keyId: input.keyId,
          mode: input.mode,
          model: input.model,
          provider: input.provider,
          parameters: input.parameters,
          input: input.input,
          status: "created",
        },
      });
    }),
  update: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        playgroundHistoryId: z.string(),
        output: jsonSchema,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "playground:CUD",
      });
      return ctx.prisma.playgroundHistory.update({
        where: {
          projectId: input.projectId,
          id: input.playgroundHistoryId,
        },
        data: {
          output: input.output,
          status:
            typeof input.output === "object" &&
            input.output.hasOwnProperty("error")
              ? "error"
              : "completed",
        },
      });
    }),
});
