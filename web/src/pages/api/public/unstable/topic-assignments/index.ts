import {
  createUnstablePublicApiRoute,
  withUnstablePublicApiMiddlewares,
} from "@/src/features/public-api/server/unstable-public-api-route";
import {
  GetUnstableTopicAssignmentsQuery,
  GetUnstableTopicAssignmentsResponse,
} from "@/src/features/public-api/types/unstable-topics";
import { listPublicTopicAssignments } from "@/src/features/topics/server/publicApi";

export default withUnstablePublicApiMiddlewares({
  GET: createUnstablePublicApiRoute({
    name: "List Unstable Topic Assignments",
    action: "topics:read",
    querySchema: GetUnstableTopicAssignmentsQuery,
    responseSchema: GetUnstableTopicAssignmentsResponse,
    fn: ({ query, auth }) =>
      listPublicTopicAssignments({
        projectId: auth.scope.projectId,
        plan: auth.scope.plan,
        ...query,
      }),
  }),
});
