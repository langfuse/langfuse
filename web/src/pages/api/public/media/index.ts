import { env } from "@/src/env.mjs";
import { createMediaUploadUrl } from "@/src/features/media/server/mediaService";
import {
  GetMediaUploadUrlQuerySchema,
  GetMediaUploadUrlResponseSchema,
} from "@/src/features/media/validation";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { ForbiddenError, InvalidRequestError } from "@langfuse/shared";
import { instrumentAsync } from "@langfuse/shared/src/server";

export default withMiddlewares({
  POST: createAuthedProjectAPIRoute({
    name: "Get Media Upload URL",
    bodySchema: GetMediaUploadUrlQuerySchema,
    responseSchema: GetMediaUploadUrlResponseSchema,
    successStatusCode: 201,
    rateLimitResource: "media-upload",
    fn: async ({ body, auth }) => {
      // Check if ingestion is suspended due to usage threshold
      if (auth.scope.isIngestionSuspended) {
        throw new ForbiddenError(
          "Ingestion suspended: Usage threshold exceeded. Please upgrade your plan.",
        );
      }

      if (auth.scope.accessLevel !== "project") throw new ForbiddenError();

      const { projectId } = auth.scope;
      const { contentLength, sha256Hash, traceId, observationId, field } = body;

      if (contentLength > env.LANGFUSE_S3_MEDIA_MAX_CONTENT_LENGTH)
        throw new InvalidRequestError(
          `File size must be less than ${env.LANGFUSE_S3_MEDIA_MAX_CONTENT_LENGTH} bytes`,
        );

      return await instrumentAsync(
        { name: "media-create-upload-url" },
        async (span) => {
          span.setAttribute("projectId", projectId);
          span.setAttribute("traceId", traceId ?? "");
          span.setAttribute("observationId", observationId ?? "");
          span.setAttribute("field", field ?? "");
          span.setAttribute("sha256Hash", sha256Hash);

          const result = await createMediaUploadUrl({ projectId, body });
          span.setAttribute("mediaId", result.mediaId);

          return result;
        },
      );
    },
  }),
});
