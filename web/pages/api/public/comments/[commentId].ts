import { getCommentForApi } from "@/src/annotation/comments/server";
import { withMiddlewares } from "@/src/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/public-api/server/createAuthedProjectAPIRoute";
import {
  GetCommentV1Query,
  GetCommentV1Response,
} from "@/src/public-api/types/comments";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get Comment",
    action: "comments:read",
    querySchema: GetCommentV1Query,
    responseSchema: GetCommentV1Response,
    fn: async ({ query, auth }) =>
      await getCommentForApi({
        commentId: query.commentId,
        projectId: auth.scope.projectId,
      }),
  }),
});
