import {
  createUnstablePublicApiRoute,
  withUnstablePublicApiMiddlewares,
} from "@/src/features/public-api/server/unstable-public-api-route";
import {
  GetUnstableTopicFacetsQuery,
  GetUnstableTopicFacetsResponse,
} from "@/src/features/public-api/types/unstable-topics";
import { listPublicTopicFacets } from "@/src/features/topics/server/publicApi";

export default withUnstablePublicApiMiddlewares({
  GET: createUnstablePublicApiRoute({
    name: "List Unstable Topic Facets",
    action: "topics:read",
    querySchema: GetUnstableTopicFacetsQuery,
    responseSchema: GetUnstableTopicFacetsResponse,
    fn: ({ query, auth }) =>
      listPublicTopicFacets({ projectId: auth.scope.projectId, ...query }),
  }),
});
