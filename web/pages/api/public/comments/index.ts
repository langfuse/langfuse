import { withMiddlewares } from "@/src/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/public-api/server/createAuthedProjectAPIRoute";
import {
  createCommentForApi,
  listCommentsForApi,
} from "@/src/annotation/comments/server";
import {
  GetCommentsV1Query,
  GetCommentsV1Response,
  PostCommentsV1Body,
  PostCommentsV1Response,
} from "@/src/public-api/types/comments";

export default withMiddlewares({
  POST: createAuthedProjectAPIRoute({
    name: "Create Comment",
    action: "comments:CUD",
    bodySchema: PostCommentsV1Body,
    responseSchema: PostCommentsV1Response,
    fn: async ({ body, auth }) =>
      await createCommentForApi({ input: body, auditScope: auth.scope }),
  }),
  GET: createAuthedProjectAPIRoute({
    name: "Get Comments",
    action: "comments:read",
    querySchema: GetCommentsV1Query,
    responseSchema: GetCommentsV1Response,
    fn: async ({ query, auth }) =>
      await listCommentsForApi({ ...query, projectId: auth.scope.projectId }),
  }),
});
