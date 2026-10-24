import {
  createUnstablePublicApiRoute,
  withUnstablePublicApiMiddlewares,
} from "@/src/features/public-api/server/unstable-public-api-route";
import {
  GetUnstableTopicTracesQuery,
  GetUnstableTopicTracesResponse,
} from "@/src/features/public-api/types/unstable-topics";
import { listPublicTopicTraces } from "@/src/features/topics/server/publicApi";

export default withUnstablePublicApiMiddlewares({
  GET: createUnstablePublicApiRoute({
    name: "Get Unstable Topics For Traces",
    action: "topics:read",
    querySchema: GetUnstableTopicTracesQuery,
    responseSchema: GetUnstableTopicTracesResponse,
    fn: ({ query, auth }) =>
      listPublicTopicTraces({ projectId: auth.scope.projectId, ...query }),
  }),
});
