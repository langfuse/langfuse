import { z } from "zod";

export const posthogIntegrationFormSchema = z.object({
  posthogHostname: z.string().url(),
  posthogProjectApiKey: z.string().refine((v) => v.startsWith("phc_"), {
    message: "PostHog Project API Key must start with 'phc_'",
  }),
  enabled: z.boolean(),
});
