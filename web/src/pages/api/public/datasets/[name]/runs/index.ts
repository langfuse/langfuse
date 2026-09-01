import {
  GetDatasetRunsV1Query,
  GetDatasetRunsV1Response,
} from "@/src/features/public-api/types/datasets";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { listDatasetRunsForApi } from "@/src/features/datasets/server/publicDatasetService";
import { DATASET_RUNS_DEPRECATION } from "@/src/features/public-api/server/deprecations";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "get-dataset-runs",
    querySchema: GetDatasetRunsV1Query,
    responseSchema: GetDatasetRunsV1Response,
    deprecation: DATASET_RUNS_DEPRECATION,
    rateLimitResource: "datasets",
    // Lists legacy dataset runs whose items live in the dataset_run_items
    // ClickHouse table, which is no longer populated in events_only mode;
    // GET /api/public/experiments is the replacement.
    rejectInEventsOnlyMode: true,
    fn: async ({ query, auth }) =>
      await listDatasetRunsForApi({
        projectId: auth.scope.projectId,
        name: query.name,
        page: query.page,
        limit: query.limit,
      }),
  }),
});
