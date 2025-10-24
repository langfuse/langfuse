import { z } from "zod/v4";

export const mixpanelIntegrationFormSchema = z.object({
  mixpanelRegion: z.enum(["api", "api-eu", "api-in"]),
  mixpanelProjectToken: z
    .string()
    .min(1, "Project Token is required")
    .refine(
      (v) => v.length > 0,
      "Mixpanel Project Token is required. You can find it in your Mixpanel project settings.",
    ),
  enabled: z.boolean(),
});
