import {
  createUnstablePublicApiRoute,
  withUnstablePublicApiMiddlewares,
} from "@/src/features/public-api/server/unstable-public-api-route";
import {
  GetUnstableTopicQuery,
  GetUnstableTopicResponse,
} from "@/src/features/public-api/types/unstable-topics";
import { getPublicTopic } from "@/src/features/topics/server/publicApi";

export default withUnstablePublicApiMiddlewares({
  GET: createUnstablePublicApiRoute({
    name: "Get Unstable Topic",
    action: "topics:read",
    querySchema: GetUnstableTopicQuery,
    responseSchema: GetUnstableTopicResponse,
    fn: ({ query, auth }) =>
      getPublicTopic({ projectId: auth.scope.projectId, ...query }),
  }),
});
