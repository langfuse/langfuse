import {
  createUnstablePublicApiRoute,
  withUnstablePublicApiMiddlewares,
} from "@/src/features/public-api/server/unstable-public-api-route";
import {
  GetUnstableTopicsQuery,
  GetUnstableTopicsResponse,
} from "@/src/features/public-api/types/unstable-topics";
import { listPublicTopics } from "@/src/features/topics/server/publicApi";

export default withUnstablePublicApiMiddlewares({
  GET: createUnstablePublicApiRoute({
    name: "List Unstable Topics",
    action: "topics:read",
    querySchema: GetUnstableTopicsQuery,
    responseSchema: GetUnstableTopicsResponse,
    fn: ({ query, auth }) =>
      listPublicTopics({ projectId: auth.scope.projectId, ...query }),
  }),
});
