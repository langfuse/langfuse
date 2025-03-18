import { createAuthedAPIRoute } from "@/src/features/public-api/server/createAuthedAPIRoute";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import {
  PostTraceTagsV1Query,
  PostTraceTagsV1Body,
  PostTraceTagsV1Response,
} from "@/src/features/public-api/types/traces";
import { LangfuseNotFoundError } from "@langfuse/shared";
import {
  getTraceById,
  convertTraceDomainToClickhouse,
  upsertTrace,
} from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";
import { auditLog } from "@/src/features/audit-logs/auditLog";

export default withMiddlewares({
  POST: createAuthedAPIRoute({
    name: "Add Tag to Trace",
    querySchema: PostTraceTagsV1Query,
    bodySchema: PostTraceTagsV1Body,
    responseSchema: PostTraceTagsV1Response,
    successStatusCode: 202, // Accepted - for background processing
    fn: async ({ query, body, auth }) => {
      const { traceId } = query;
      const { tag } = body;

      // Get the trace to update
      const trace = await getTraceById(traceId, auth.scope.projectId);

      if (!trace) {
        throw new LangfuseNotFoundError(
          `Trace ${traceId} not found within authorized project`,
        );
      }

      // Add tag if it doesn't already exist
      const updatedTags = [...trace.tags];
      if (!updatedTags.includes(tag)) {
        updatedTags.push(tag);
      }

      // Only update if a change was made
      if (updatedTags.length !== trace.tags.length) {
        // Log audit entry
        await auditLog({
          resourceType: "trace",
          resourceId: traceId,
          action: "addTag",
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
