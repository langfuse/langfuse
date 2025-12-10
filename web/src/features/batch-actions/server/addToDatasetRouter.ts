import { auditLog } from "@/src/features/audit-logs/auditLog";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import {
  BatchActionQueue,
  logger,
  QueueJobs,
  getObservationById,
  getObservationsCountFromEventsTable,
  getObservationsTableCount,
} from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";
import { DatasetItemValidator } from "@langfuse/shared/src/server";
import {
  applyFullMapping,
  testJsonPath,
  BatchTableNames,
  BatchActionType,
  BatchActionStatus,
  ActionId,
  isJsonPath,
} from "@langfuse/shared";
import { env } from "@/src/env.mjs";
import {
  CreateObservationAddToDatasetActionSchema,
  ValidateBatchAddToDatasetMappingSchema,
} from "../validation";

const MAX_BATCH_ADD_TO_DATASET_ITEMS = 1000;

export const addToDatasetRouter = createTRPCRouter({
  create: protectedProjectProcedure
    .input(CreateObservationAddToDatasetActionSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        // Check permissions
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "datasets:CUD",
        });

        const { projectId, query, config } = input;

        // Check observation count doesn't exceed maximum
        const queryOpts = {
          projectId,
          filter: query.filter ?? [],
          limit: 1,
          offset: 0,
        };
        const observationCount =
          env.LANGFUSE_ENABLE_EVENTS_TABLE_OBSERVATIONS === "true"
            ? await getObservationsCountFromEventsTable(queryOpts)
            : await getObservationsTableCount(queryOpts);

        if (observationCount > MAX_BATCH_ADD_TO_DATASET_ITEMS) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Too many observations selected. Maximum allowed is ${MAX_BATCH_ADD_TO_DATASET_ITEMS}, but ${observationCount} observations match your filters. Please refine your filters to reduce the count.`,
          });
        }
        const userId = ctx.session.user.id;

        logger.info("[TRPC] Creating observation-add-to-dataset action", {
          projectId,
        });

        // Create table batch action record
        const batchAction = await ctx.prisma.batchAction.create({
          data: {
            projectId,
            userId,
            actionType: ActionId.ObservationAddToDataset,
            tableName: BatchTableNames.Observations,
            status: BatchActionStatus.Queued,
            query,
            config,
          },
        });

        // Create audit log
        await auditLog({
          session: ctx.session,
          resourceType: "batchAction",
          resourceId: batchAction.id,
          projectId,
          action: "create",
          after: batchAction,
        });

        // Queue the job
        await BatchActionQueue.getInstance()?.add(
          QueueJobs.BatchActionProcessingJob,
          {
            id: batchAction.id,
            name: QueueJobs.BatchActionProcessingJob,
            timestamp: new Date(),
            payload: {
              batchActionId: batchAction.id,
              projectId,
              actionId: ActionId.ObservationAddToDataset,
              tableName: BatchTableNames.Observations,
              cutoffCreatedAt: new Date(),
              query,
              config,
              type: BatchActionType.Create,
            },
          },
          {
            jobId: batchAction.id,
          },
        );

        return { id: batchAction.id };
      } catch (e) {
        logger.error(e);
        if (e instanceof TRPCError) {
          throw e;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Creating add-to-dataset action failed.",
        });
      }
    }),

  validateMapping: protectedProjectProcedure
    .input(ValidateBatchAddToDatasetMappingSchema)
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "datasets:CUD",
      });

      try {
        // Fetch observation data
        const observation = await getObservationById({
          id: input.observationId,
          projectId: input.projectId,
          traceId: input.traceId,
          fetchWithInputOutput: true,
        });

        if (!observation) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Observation not found",
          });
        }

        // Parse observation data
        const observationData = {
          input: observation.input,
          output: observation.output,
          metadata: observation.metadata,
        };

        // Test JSON paths in custom mappings
        const errors: string[] = [];

        const validateFieldMappingConfig = (
          config: typeof input.mapping.input,
          fieldName: string,
        ) => {
          if (config.mode !== "custom" || !config.custom) return;

          if (config.custom.type === "root" && config.custom.rootConfig) {
            const { sourceField, jsonPath } = config.custom.rootConfig;
            if (jsonPath && isJsonPath(jsonPath)) {
              const sourceData =
                observationData[sourceField as keyof typeof observationData];
              const result = testJsonPath({ jsonPath, data: sourceData });
              if (!result.success) {
                errors.push(
                  `Invalid JSON path "${jsonPath}" for ${fieldName}: ${result.error}`,
                );
              }
            }
          }

          if (
            config.custom.type === "keyValueMap" &&
            config.custom.keyValueMapConfig
          ) {
            for (const entry of config.custom.keyValueMapConfig.entries) {
              if (isJsonPath(entry.value)) {
                const sourceData =
                  observationData[
                    entry.sourceField as keyof typeof observationData
                  ];
                const result = testJsonPath({
                  jsonPath: entry.value,
                  data: sourceData,
                });
                if (!result.success) {
                  errors.push(
                    `Invalid JSON path "${entry.value}" for ${fieldName}.${entry.key}: ${result.error}`,
                  );
                }
              }
            }
          }
        };

        validateFieldMappingConfig(input.mapping.input, "input");
        validateFieldMappingConfig(
          input.mapping.expectedOutput,
          "expectedOutput",
        );
        validateFieldMappingConfig(input.mapping.metadata, "metadata");

        // If JSON path validation failed, return early
        if (errors.length > 0) {
          return {
            success: false,
            preview: null,
            validationErrors: errors,
          };
        }

        // Apply mapping using the new format
        const transformed = applyFullMapping({
          observation: observationData,
          mapping: input.mapping,
        });

        // Fetch dataset schema
        const dataset = await ctx.prisma.dataset.findUnique({
          where: {
            id_projectId: {
              id: input.datasetId,
              projectId: input.projectId,
            },
          },
          select: {
            inputSchema: true,
            expectedOutputSchema: true,
          },
        });

        if (!dataset) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Dataset not found",
          });
        }

        // Validate against dataset schema
        const validator = new DatasetItemValidator({
          inputSchema: dataset.inputSchema as Record<string, unknown> | null,
          expectedOutputSchema: dataset.expectedOutputSchema as Record<
            string,
            unknown
          > | null,
        });

        const validationResult = validator.validateAndNormalize({
          input: transformed.input,
          expectedOutput: transformed.expectedOutput,
          metadata: transformed.metadata,
          normalizeOpts: { sanitizeControlChars: true },
          validateOpts: { normalizeUndefinedToNull: true },
        });

        if (!validationResult.success) {
          return {
            success: false,
            preview: {
              input: transformed.input,
              expectedOutput: transformed.expectedOutput,
              metadata: transformed.metadata,
            },
            validationErrors: [validationResult.message],
          };
        }

        return {
          success: true,
          preview: {
            input: transformed.input,
            expectedOutput: transformed.expectedOutput,
            metadata: transformed.metadata,
          },
          validationErrors: [],
        };
      } catch (error) {
        logger.error("Validation error", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Validation failed",
        });
      }
    }),
});
