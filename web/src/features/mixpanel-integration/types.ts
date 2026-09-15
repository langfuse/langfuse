import { AnalyticsIntegrationExportSource } from "@langfuse/shared";
import { z } from "zod";

export const MIXPANEL_REGIONS = [
  {
    subdomain: "api",
    description: "US (api.mixpanel.com)",
  },
  {
    subdomain: "api-eu",
    description: "EU (api-eu.mixpanel.com)",
  },
  {
    subdomain: "api-in",
    description: "India (api-in.mixpanel.com)",
  },
] as const;

export type MixpanelRegion = (typeof MIXPANEL_REGIONS)[number]["subdomain"];

export const mixpanelIntegrationFormSchema = z.object({
  mixpanelRegion: z.enum(MIXPANEL_REGIONS.map((r) => r.subdomain)),
  // Write-only: blank keeps the persisted credential (required on create,
  // enforced server-side and via page-level superRefine).
  mixpanelProjectToken: z.string().optional(),
  enabled: z.boolean(),
  exportSource: z
    .enum(AnalyticsIntegrationExportSource)
    .default(AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS),
});
