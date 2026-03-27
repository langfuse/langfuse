import { z } from "zod/v4";

export const kubitIntegrationFormSchema = z.object({
  endpointUrl: z.string().url("Must be a valid URL"),
  apiKey: z.string(),
  enabled: z.boolean(),
  syncIntervalMinutes: z.number().int().min(15).max(1440),
  requestTimeoutSeconds: z.number().int().min(5).max(300),
});
