import { getCommentForApi } from "@/src/features/comments/server/publicCommentService";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  GetCommentV1Query,
  GetCommentV1Response,
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
});
