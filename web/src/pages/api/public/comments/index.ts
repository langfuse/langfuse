import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  createCommentForApi,
  listCommentsForApi,
} from "@/src/features/comments/server/publicCommentService";
import {
  GetCommentsV1Query,
  GetCommentsV1Response,
  PostCommentsV1Body,
  PostCommentsV1Response,
} from "@/src/features/public-api/types/comments";

export default withMiddlewares({
  POST: createAuthedProjectAPIRoute({
    name: "Create Comment",
    bodySchema: PostCommentsV1Body,
    responseSchema: PostCommentsV1Response,
    fn: async ({ body, auth }) =>
      await createCommentForApi({ input: body, auditScope: auth.scope }),
  }),
  GET: createAuthedProjectAPIRoute({
    name: "Get Comments",
    querySchema: GetCommentsV1Query,
    responseSchema: GetCommentsV1Response,
    fn: async ({ query, auth }) =>
      await listCommentsForApi({ ...query, projectId: auth.scope.projectId }),
  }),
});
