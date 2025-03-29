import { createAuthedAPIRoute } from "@/src/features/public-api/server/createAuthedAPIRoute";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import {
  DeleteTraceTagV1Query,
  DeleteTraceTagV1Response,
} from "@/src/features/public-api/types/traces";
import { LangfuseNotFoundError } from "@langfuse/shared";
import {
  getTraceById,
  convertTraceDomainToClickhouse,
  upsertTrace,
} from "@langfuse/shared/src/server";
import { auditLog } from "@/src/features/audit-logs/auditLog";

export default withMiddlewares({
  DELETE: createAuthedAPIRoute({
    name: "Remove Tag from Trace",
    querySchema: DeleteTraceTagV1Query,
    responseSchema: DeleteTraceTagV1Response,
    successStatusCode: 202, // Accepted - for background processing
    fn: async ({ query, auth }) => {
      const { traceId, tagId } = query;

      // Get the trace to update
      const trace = await getTraceById(traceId, auth.scope.projectId);

      if (!trace) {
        throw new LangfuseNotFoundError(
          `Trace ${traceId} not found within authorized project`,
        );
      }

      // Create new tags array without the specified tag
      const updatedTags = trace.tags.filter((tag) => tag !== tagId);

      // Only update if a tag was removed
      if (updatedTags.length !== trace.tags.length) {
        // Log audit entry
        await auditLog({
          resourceType: "trace",
          resourceId: traceId,
          action: "removeTag",
          before: trace.tags,
          after: updatedTags,
          projectId: auth.scope.projectId,
          apiKeyId: auth.scope.apiKeyId,
          orgId: auth.scope.orgId,
        });

        // Update trace
        trace.tags = updatedTags;
        await upsertTrace(convertTraceDomainToClickhouse(trace));
      }

      return { id: traceId };
    },
  }),
});
