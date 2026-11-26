import {
  createUnstablePublicApiRoute,
  withUnstablePublicApiMiddlewares,
} from "@/src/features/public-api/server/unstable-public-api-route";
import {
  TopicRuleIdQuery,
  GetUnstableTopicRuleResponse,
} from "@/src/features/public-api/types/unstable-topics";
import { getPublicTopicRule } from "@/src/features/topics/server/publicApi";

export default withUnstablePublicApiMiddlewares({
  GET: createUnstablePublicApiRoute({
    name: "Get Unstable Topic Rule",
    action: "topics:read",
    querySchema: TopicRuleIdQuery,
    responseSchema: GetUnstableTopicRuleResponse,
    fn: ({ query, auth }) =>
      getPublicTopicRule({ projectId: auth.scope.projectId, ...query }),
  }),
});
