import {
  createUnstablePublicApiRoute,
  withUnstablePublicApiMiddlewares,
} from "@/src/features/public-api/server/unstable-public-api-route";
import {
  GetUnstableTopicSummariesQuery,
  GetUnstableTopicSummariesResponse,
} from "@/src/features/public-api/types/unstable-topics";
import { listPublicTopicSummaries } from "@/src/features/topics/server/publicApi";

export default withUnstablePublicApiMiddlewares({
  GET: createUnstablePublicApiRoute({
    name: "List Unstable Topic Summaries",
    action: "topics:read",
    querySchema: GetUnstableTopicSummariesQuery,
    responseSchema: GetUnstableTopicSummariesResponse,
    fn: ({ query, auth }) =>
      listPublicTopicSummaries({
        projectId: auth.scope.projectId,
        plan: auth.scope.plan,
        ...query,
      }),
  }),
});
