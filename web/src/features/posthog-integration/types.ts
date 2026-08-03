import { AnalyticsIntegrationExportSource } from "@langfuse/shared";
import { z } from "zod";

export const posthogIntegrationFormSchema = z.object({
  posthogHostname: z.url().transform((v) => new URL(v).href),
  // Write-only: blank keeps the persisted credential (required on create,
  // enforced server-side and via page-level superRefine).
  posthogProjectApiKey: z
    .string()
    .refine((v) => v === "" || v.startsWith("phc_"), {
      message:
        "PostHog 'Project API Key' must start with 'phc_'. You can find it in the PostHog project settings.",
    })
    .optional(),
  enabled: z.boolean(),
  exportSource: z
    .enum(AnalyticsIntegrationExportSource)
    .default(AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS),
});
