import {
  TraceliftTraceIssuesInputSchema,
  TraceliftTraceIssuesOutputSchema,
  TraceliftIssueCountsInputSchema,
  TraceliftIssueCountsOutputSchema,
} from "@langfuse/shared";
import {
  getTraceliftIssuesForTrace,
  getTraceliftIssueCounts,
} from "@langfuse/shared/src/server";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";

export const traceliftRouter = createTRPCRouter({
  byTrace: protectedProjectProcedure
    .input(TraceliftTraceIssuesInputSchema)
    .output(TraceliftTraceIssuesOutputSchema)
    .query(({ input, ctx }) =>
      getTraceliftIssuesForTrace({
        ...input,
        projectId: ctx.session.projectId,
      }),
    ),
  issueCounts: protectedProjectProcedure
    .input(TraceliftIssueCountsInputSchema)
    .output(TraceliftIssueCountsOutputSchema)
    .query(({ input, ctx }) =>
      getTraceliftIssueCounts({ ...input, projectId: ctx.session.projectId }),
    ),
});
