import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import {
  CreateObservationIoParserConfigInput,
  DeleteObservationIoParserConfigInput,
  ObservationIoParserConfigService,
  SetObservationIoParserProjectPreferenceInput,
  SetObservationIoParserUserPreferenceInput,
  UpdateObservationIoParserConfigInput,
} from "@langfuse/shared/src/server";

export const observationIoParsersRouter = createTRPCRouter({
  list: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "observationIoParsers:read",
      });

      return ObservationIoParserConfigService.listConfigs(input.projectId);
    }),

  create: protectedProjectProcedure
    .input(CreateObservationIoParserConfigInput)
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "observationIoParsers:CUD",
      });

      const config = await ObservationIoParserConfigService.createConfig(
        input,
        ctx.session.user?.id,
      );

      return { success: true, config };
    }),

  update: protectedProjectProcedure
    .input(UpdateObservationIoParserConfigInput)
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "observationIoParsers:CUD",
      });

      const config = await ObservationIoParserConfigService.updateConfig(
        input,
        ctx.session.user?.id,
      );

      return { success: true, config };
    }),

  delete: protectedProjectProcedure
    .input(DeleteObservationIoParserConfigInput)
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "observationIoParsers:CUD",
      });

      await ObservationIoParserConfigService.deleteConfig(input);

      return { success: true };
    }),

  getProjectPreference: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "observationIoParsers:read",
      });

      return ObservationIoParserConfigService.getProjectPreference(
        input.projectId,
      );
    }),

  setProjectPreference: protectedProjectProcedure
    .input(SetObservationIoParserProjectPreferenceInput)
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "observationIoParsers:CUD",
      });

      const preference =
        await ObservationIoParserConfigService.setProjectPreference(
          input,
          ctx.session.user?.id,
        );

      return { success: true, preference };
    }),

  getUserPreference: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "observationIoParsers:read",
      });

      const userId = ctx.session.user?.id;
      if (!userId) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      return ObservationIoParserConfigService.getUserPreference(
        input.projectId,
        userId,
      );
    }),

  setUserPreference: protectedProjectProcedure
    .input(SetObservationIoParserUserPreferenceInput)
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "observationIoParsers:read",
      });

      const userId = ctx.session.user?.id;
      if (!userId) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      const preference =
        await ObservationIoParserConfigService.setUserPreference(input, userId);

      return { success: true, preference };
    }),
});
