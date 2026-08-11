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
  buildStableDatasetRunItemResponseEventsOnly,
  listDatasetRunItemsForApi,
} from "@/src/features/datasets/server/publicDatasetService";
import { DATASET_RUN_ITEMS_DEPRECATION } from "@/src/features/public-api/server/deprecations";
import { env } from "@/src/env.mjs";

export default withMiddlewares({
  POST: createAuthedProjectAPIRoute({
    name: "Create Dataset Run Item",
    bodySchema: PostDatasetRunItemsV1Body,
    responseSchema: PostDatasetRunItemsV1Response,
    rateLimitResource: "datasets",
    // Writes a dataset-run-item event into the legacy dataset_run_items
    // ClickHouse table. events_only deployments no longer populate that table,
    // so instead of writing anything we return a stable experiment id (== the
    // dataset run id) derived deterministically from (projectId, datasetId,
    // runName). The trace ↔ experiment link is established through OTel
    // experiment span attributes on ingestion instead.
    fn: async ({ body, auth, res }) => {
      if (env.LANGFUSE_MIGRATION_V4_WRITE_MODE === "events_only") {
        return await buildStableDatasetRunItemResponseEventsOnly({
          body,
          auth,
        });
      }
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
