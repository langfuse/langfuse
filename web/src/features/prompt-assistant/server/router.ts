import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { TRPCError } from "@trpc/server";
import { logger } from "@langfuse/shared/src/server";
import { CreatePromptAssistantCompletion } from "../validation";

export const promptAssistantRouter = createTRPCRouter({
  createCompletion: protectedProjectProcedure
    .input(CreatePromptAssistantCompletion)
    .mutation(async ({ input, ctx }) => {
      try {
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "prompts:CUD",
        });

        logger.info(
          `Prompt Assistant completion request received:\n${JSON.stringify(input, null, 2)}`,
        );

        return "This is a great prompt!";
      } catch (error) {
        logger.error("Failed to create prompt assistant completion: ", error);

        if (error instanceof TRPCError) {
          throw error;
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create prompt assistant completion",
        });
      }
    }),
});
