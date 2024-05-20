import { z } from "zod";

export const cloudConfigSchema = z.object({
  plan: z.enum(["Hobby", "Pro", "Team", "Enterprise"]).optional(),
  monthlyObservationLimit: z.number().int().positive().optional(),
});
