import { z } from "zod";

export const cloudConfigSchema = z.object({
  plan: z.enum(["Hobby", "Pro", "Team", "Enterprise"]).optional(),
  monthlyObservationLimit: z.number().int().positive().optional(),
  // used for table and dashboard queries
  defaultLookBackDays: z.number().int().positive().optional(),
});
