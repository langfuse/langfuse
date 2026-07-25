import {
  GetDatasetRunV1Query,
  GetDatasetRunV1Response,
  DeleteDatasetRunV1Query,
  DeleteDatasetRunV1Response,
} from "@/src/features/public-api/types/datasets";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  deleteDatasetRunForApi,
  getDatasetRunForApi,
} from "@/src/features/datasets/server/publicDatasetService";
import { DATASET_RUNS_DEPRECATION } from "@/src/features/public-api/server/deprecations";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "get-dataset-run",
    querySchema: GetDatasetRunV1Query,
    responseSchema: GetDatasetRunV1Response,
    deprecation: DATASET_RUNS_DEPRECATION,
    rateLimitResource: "datasets",
    // Embeds run items read from the legacy dataset_run_items ClickHouse
    // table, which is no longer populated in events_only mode;
    // GET /api/public/experiments + /experiment-items are the replacement.
    rejectInEventsOnlyMode: true,
    fn: async ({ query, auth }) =>
      await getDatasetRunForApi({
        projectId: auth.scope.projectId,
        name: query.name,
        runName: query.runName,
      }),
  }),
  DELETE: createAuthedProjectAPIRoute({
    name: "delete-dataset-run",
    querySchema: DeleteDatasetRunV1Query,
    responseSchema: DeleteDatasetRunV1Response,
    rateLimitResource: "datasets",
    // Deletes legacy dataset runs and their dataset_run_items ClickHouse
    // rows, which are no longer written in events_only mode; delete the
    // underlying traces via DELETE /api/public/traces instead.
    rejectInEventsOnlyMode: true,
    fn: async ({ query, auth }) =>
      await deleteDatasetRunForApi({
        projectId: auth.scope.projectId,
        orgId: auth.scope.orgId,
        apiKeyId: auth.scope.apiKeyId,
        name: query.name,
        runName: query.runName,
      }),
  }),
});
