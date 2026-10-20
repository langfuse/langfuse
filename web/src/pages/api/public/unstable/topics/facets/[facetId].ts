import {
  createUnstablePublicApiRoute,
  withUnstablePublicApiMiddlewares,
} from "@/src/features/public-api/server/unstable-public-api-route";
import {
  GetUnstableTopicFacetResponse,
  TopicFacetIdQuery,
} from "@/src/features/public-api/types/unstable-topics";
import { getPublicTopicFacet } from "@/src/features/topics/server/publicApi";

export default withUnstablePublicApiMiddlewares({
  GET: createUnstablePublicApiRoute({
    name: "Get Unstable Topic Facet",
    action: "topics:read",
    querySchema: TopicFacetIdQuery,
    responseSchema: GetUnstableTopicFacetResponse,
    fn: ({ query, auth }) =>
      getPublicTopicFacet({ projectId: auth.scope.projectId, ...query }),
  }),
});
