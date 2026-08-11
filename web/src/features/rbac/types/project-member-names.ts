import { z } from "zod";

export const ProjectMemberNamesResponse = z.object({
  members: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
    }),
  ),
});

export type ProjectMemberNamesResponse = z.infer<
  typeof ProjectMemberNamesResponse
>;
