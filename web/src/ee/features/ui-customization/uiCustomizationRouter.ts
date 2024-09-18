import { env } from "@/src/env.mjs";
import { createTRPCRouter, protectedProcedure } from "@/src/server/api/trpc";

export const uiCustomizationRouter = createTRPCRouter({
  get: protectedProcedure.query(({ ctx }) => {
    if (!ctx.session.environment.eeEnabled) return null;

    return {
      hostname: env.LANGFUSE_UI_API_HOST,
      documentationHref: env.LANGFUSE_UI_DOCUMENTATION_HREF,
      supportHref: env.LANGFUSE_UI_SUPPORT_HREF,
      feedbackHref: env.LANGFUSE_UI_FEEDBACK_HREF,
      logoLightModeHref: env.LANGFUSE_UI_LOGO_LIGHT_MODE_HREF,
      logoDarkModeHref: env.LANGFUSE_UI_LOGO_DARK_MODE_HREF,
    };
  }),
});
