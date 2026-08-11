import {
  deleteCommentForApi,
  getCommentForApi,
} from "@/src/features/comments/server/publicCommentService";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  GetCommentV1Query,
  GetCommentV1Response,
  DeleteCommentV1Query,
  DeleteCommentV1Response,
} from "@/src/features/public-api/types/comments";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get Comment",
    querySchema: GetCommentV1Query,
    responseSchema: GetCommentV1Response,
    fn: async ({ query, auth }) =>
      await getCommentForApi({
        commentId: query.commentId,
        projectId: auth.scope.projectId,
      }),
  }),
  DELETE: createAuthedProjectAPIRoute({
    name: "Delete Comment",
    querySchema: DeleteCommentV1Query,
    responseSchema: DeleteCommentV1Response,
    rateLimitResource: "comment-delete",
    fn: async ({ query, auth }) =>
      await deleteCommentForApi({
        commentId: query.commentId,
        projectId: auth.scope.projectId,
        orgId: auth.scope.orgId,
        apiKeyId: auth.scope.apiKeyId,
      }),
  }),
});
