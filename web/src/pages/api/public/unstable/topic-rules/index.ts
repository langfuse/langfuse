import {
  createUnstablePublicApiRoute,
  withUnstablePublicApiMiddlewares,
} from "@/src/features/public-api/server/unstable-public-api-route";
import {
  GetUnstableTopicRulesQuery,
  GetUnstableTopicRulesResponse,
} from "@/src/features/public-api/types/unstable-topics";
import { listPublicTopicRules } from "@/src/features/topics/server/publicApi";

export default withUnstablePublicApiMiddlewares({
  GET: createUnstablePublicApiRoute({
    name: "List Unstable Topic Rules",
    action: "topics:read",
    querySchema: GetUnstableTopicRulesQuery,
    responseSchema: GetUnstableTopicRulesResponse,
    fn: ({ query, auth }) =>
      listPublicTopicRules({ projectId: auth.scope.projectId, ...query }),
  }),
});
