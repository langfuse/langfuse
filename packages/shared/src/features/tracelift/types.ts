import { z } from "zod";
import { paginationLimitZod } from "../../utils/zod";

export const TraceliftIssueInsertSchema = z.object({
  id: z.string().min(1),
  traceId: z.string().min(1),
  observationId: z.string().min(1).nullish(),
  issues: z.string().min(1),
  timestamp: z.date(),
});

export type TraceliftIssueInsert = z.infer<typeof TraceliftIssueInsertSchema>;

export const TraceliftIssueSchema = TraceliftIssueInsertSchema.extend({
  projectId: z.string().min(1),
  observationId: z.string().min(1).nullable(),
});

export type TraceliftIssue = z.infer<typeof TraceliftIssueSchema>;

export const TraceliftTraceIssuesInputSchema = z
  .object({
    projectId: z.string().min(1),
    traceId: z.string().min(1),
    fromTimestamp: z.date().optional(),
    toTimestamp: z.date().optional(),
    page: z.number().int().nonnegative().default(0),
    limit: paginationLimitZod,
  })
  .refine(
    ({ fromTimestamp, toTimestamp }) =>
      !fromTimestamp || !toTimestamp || fromTimestamp < toTimestamp,
    {
      message: "fromTimestamp must be before toTimestamp",
      path: ["toTimestamp"],
    },
  );

export type TraceliftTraceIssuesInput = z.input<
  typeof TraceliftTraceIssuesInputSchema
>;

export const TraceliftTraceIssuesOutputSchema = z.object({
  issues: z.array(TraceliftIssueSchema),
  hasMore: z.boolean(),
});

export type TraceliftTraceIssuesOutput = z.infer<
  typeof TraceliftTraceIssuesOutputSchema
>;

export const TraceliftIssueCountsInputSchema = z
  .object({
    projectId: z.string().min(1),
    fromTimestamp: z.date(),
    toTimestamp: z.date(),
  })
  .refine(({ fromTimestamp, toTimestamp }) => fromTimestamp < toTimestamp, {
    message: "fromTimestamp must be before toTimestamp",
    path: ["toTimestamp"],
  });

export type TraceliftIssueCountsInput = z.infer<
  typeof TraceliftIssueCountsInputSchema
>;

export const TraceliftIssueCountsOutputSchema = z.object({
  totalCount: z.number().int().nonnegative(),
  counts: z.array(
    z.object({
      issue: z.string().min(1),
      count: z.number().int().nonnegative(),
    }),
  ),
});

export type TraceliftIssueCountsOutput = z.infer<
  typeof TraceliftIssueCountsOutputSchema
>;
