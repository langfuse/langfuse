import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  GetDatasetRunItemsV1Query,
  GetDatasetRunItemsV1Response,
  PostDatasetRunItemsV1Body,
  PostDatasetRunItemsV1Response,
} from "@/src/features/public-api/types/datasets";
import {
  createDatasetRunItemForApi,
  listDatasetRunItemsForApi,
} from "@/src/features/datasets/server/publicDatasetService";
import { DATASET_RUN_ITEMS_DEPRECATION } from "@/src/features/public-api/server/deprecations";

export default withMiddlewares({
  // POST is a write: its deprecation signal is the Fern `availability: deprecated`
  // marker (+ generated-SDK @deprecated), not a runtime `_deprecation` body field.
  // Unlike the ingestion write siblings (which attach LEGACY_INGESTION_DEPRECATION),
  // there is no create-appropriate replacement constant to wire here —
  // DATASET_RUN_ITEMS_DEPRECATION is read-oriented (→ GET /experiment-items) and
  // would be wrong guidance on a create endpoint.
  POST: createAuthedProjectAPIRoute({
    name: "Create Dataset Run Item",
    bodySchema: PostDatasetRunItemsV1Body,
    responseSchema: PostDatasetRunItemsV1Response,
    rateLimitResource: "datasets",
    // Writes a dataset-run-item event into the legacy dataset_run_items
    // ClickHouse table; events_only deployments expect the experiment runner
    // SDK or OTel ingestion with experiment attributes instead.
    rejectInEventsOnlyMode: true,
    fn: async ({ body, auth, res }) => {
      return await createDatasetRunItemForApi({ body, auth, res });
    },
  }),
  GET: createAuthedProjectAPIRoute({
    name: "Get Dataset Run Items",
    querySchema: GetDatasetRunItemsV1Query,
    responseSchema: GetDatasetRunItemsV1Response,
    deprecation: DATASET_RUN_ITEMS_DEPRECATION,
    rateLimitResource: "datasets",
    // Reads from the legacy dataset_run_items ClickHouse table, which is no
    // longer populated in events_only mode; GET /api/public/experiment-items
    // is the replacement.
    rejectInEventsOnlyMode: true,
    fn: async ({ query, auth }) => {
      return await listDatasetRunItemsForApi({
        datasetId: query.datasetId,
        runName: query.runName,
        projectId: auth.scope.projectId,
        limit: query.limit,
        page: query.page,
      });
    },
  }),
});
