import {
  getCommentForApi,
  updateCommentForApi,
} from "@/src/features/comments/server/publicCommentService";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  GetCommentV1Query,
  GetCommentV1Response,
  PatchCommentV1Body,
  PatchCommentV1Query,
  PatchCommentV1Response,
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
  PATCH: createAuthedProjectAPIRoute({
    name: "Update Comment",
    querySchema: PatchCommentV1Query,
    bodySchema: PatchCommentV1Body,
    responseSchema: PatchCommentV1Response,
    fn: async ({ query, body, auth }) =>
      await updateCommentForApi({
        commentId: query.commentId,
        projectId: auth.scope.projectId,
        input: body,
        auditScope: auth.scope,
      }),
  }),
});
