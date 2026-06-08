import { z } from "zod";

import {
  getMedia,
  updateMediaUploadStatus,
} from "@/src/features/media/server/mediaService";
import {
  GetMediaQuerySchema,
  GetMediaResponseSchema,
  PatchMediaBodySchema,
} from "@/src/features/media/validation";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { ForbiddenError } from "@langfuse/shared";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get Media data",
    querySchema: GetMediaQuerySchema,
    responseSchema: GetMediaResponseSchema,
    fn: async ({ query, auth }) => {
      if (auth.scope.accessLevel !== "project") throw new ForbiddenError();

      const { projectId } = auth.scope;
      const { mediaId } = query;

      return await getMedia({ projectId, mediaId });
    },
  }),

  PATCH: createAuthedProjectAPIRoute({
    name: "Update Media Uploaded At",
    querySchema: z.object({
      mediaId: z.string(),
    }),
    bodySchema: PatchMediaBodySchema,
    responseSchema: z.void(),
    rateLimitResource: "ingestion",
    fn: async ({ query, body, auth }) => {
      if (auth.scope.accessLevel !== "project") throw new ForbiddenError();

      const { projectId } = auth.scope;
      const { mediaId } = query;

      await updateMediaUploadStatus({ projectId, mediaId, body });
    },
  }),
});
