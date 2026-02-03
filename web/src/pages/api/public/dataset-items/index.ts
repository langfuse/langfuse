import { prisma } from "@langfuse/shared/src/db";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  GetDatasetItemsV1Query,
  GetDatasetItemsV1Response,
  PostDatasetItemsV1Body,
  PostDatasetItemsV1Response,
  transformDbDatasetItemDomainToAPIDatasetItem,
} from "@/src/features/public-api/types/datasets";
import { LangfuseNotFoundError, Prisma } from "@langfuse/shared";
import {
  createDatasetItemFilterState,
  getDatasetItems,
  getDatasetItemsCount,
  logger,
  upsertDatasetItem,
} from "@langfuse/shared/src/server";
import { auditLog } from "@/src/features/audit-logs/auditLog";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "4.5mb",
    },
  },
};

export default withMiddlewares({
  POST: createAuthedProjectAPIRoute({
    name: "Create Dataset Item",
    bodySchema: PostDatasetItemsV1Body,
    responseSchema: PostDatasetItemsV1Response,
    rateLimitResource: "datasets",
    fn: async ({ body, auth }) => {
      const {
        datasetName,
        id,
        input,
        expectedOutput,
        metadata,
        sourceTraceId,
        sourceObservationId,
        status,
      } = body;

      try {
        const datasetItem = await upsertDatasetItem({
          projectId: auth.scope.projectId,
          datasetName: datasetName,
          datasetItemId: id ?? undefined,
          input: input ?? undefined,
          expectedOutput: expectedOutput ?? undefined,
          metadata: metadata ?? undefined,
          sourceTraceId: sourceTraceId ?? undefined,
          sourceObservationId: sourceObservationId ?? undefined,
          status: status ?? undefined,
          normalizeOpts: { sanitizeControlChars: true },
          validateOpts: { normalizeUndefinedToNull: !!id ? false : true },
        });

        await auditLog({
          action: "create",
          resourceType: "datasetItem",
          resourceId: datasetItem.id,
          projectId: auth.scope.projectId,
          orgId: auth.scope.orgId,
          apiKeyId: auth.scope.apiKeyId,
          after: datasetItem,
        });

        return transformDbDatasetItemDomainToAPIDatasetItem({
          ...datasetItem,
          datasetName: datasetName,
          status: datasetItem.status ?? "ACTIVE",
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError) {
          if (e.code === "P2025") {
            // this case happens when a dataset item was created for a different dataset.
            // In the database, the uniqueness constraint is on (id, projectId) only.
            // When this constraint is violated, the database will upsert based on (id, projectId, datasetId).
            // If this record does not exist, the database will throw an error.
            logger.warn(
              `Failed to upsert dataset item. Dataset item ${id} in project ${auth.scope.projectId} already exists for a different dataset than ${datasetName}`,
            );
            throw new LangfuseNotFoundError(
              `The dataset item with id ${id} already exists in a dataset other than ${datasetName}`,
            );
          }
        }
        throw e;
      }
    },
  }),
  GET: createAuthedProjectAPIRoute({
    name: "Get Dataset Items",
    querySchema: GetDatasetItemsV1Query,
    responseSchema: GetDatasetItemsV1Response,
    rateLimitResource: "datasets",
    fn: async ({ query, auth }) => {
      const {
        datasetName,
        sourceTraceId,
        sourceObservationId,
        version,
        page,
        limit,
      } = query;

      let datasetId: string | undefined = undefined;
      if (datasetName) {
        const dataset = await prisma.dataset.findFirst({
          where: {
            name: datasetName,
            projectId: auth.scope.projectId,
          },
        });
        if (!dataset) {
          throw new LangfuseNotFoundError("Dataset not found");
        }
        datasetId = dataset.id;
      }

      const filterState = createDatasetItemFilterState({
        ...(datasetId && { datasetIds: [datasetId] }),
        sourceTraceId: sourceTraceId ?? undefined,
        sourceObservationId: sourceObservationId ?? undefined,
      });
      const items = await getDatasetItems({
        projectId: auth.scope.projectId,
        filterState,
        version: version ?? undefined,
        includeDatasetName: true,
        limit: limit,
        page: page - 1,
      });

      const totalItems = await getDatasetItemsCount({
        projectId: auth.scope.projectId,
        filterState,
        version: version ?? undefined,
      });

      return {
        data: items.map((item) =>
          transformDbDatasetItemDomainToAPIDatasetItem(item),
        ),
        meta: {
          page,
          limit,
          totalItems,
          totalPages: Math.ceil(totalItems / limit),
        },
      };
    },
  }),
});
