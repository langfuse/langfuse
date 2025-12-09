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
  applyFieldMapping,
  testJsonPath,
  BatchTableNames,
  BatchActionType,
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
          projectId: ctx.session.projectId,
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
        const tableBatchAction = await ctx.prisma.tableBatchAction.create({
          data: {
            projectId,
            userId,
            actionType: "observation-add-to-dataset",
            tableName: "observations",
            status: "QUEUED",
            query,
            config,
          },
        });

        // Create audit log
        await auditLog({
          session: ctx.session,
          resourceType: "batchAction",
          resourceId: tableBatchAction.id,
          projectId,
          action: "create",
          after: tableBatchAction,
        });

        // Queue the job
        await BatchActionQueue.getInstance()?.add(
          QueueJobs.BatchActionProcessingJob,
          {
            id: tableBatchAction.id,
            name: QueueJobs.BatchActionProcessingJob,
            timestamp: new Date(),
            payload: {
              tableBatchActionId: tableBatchAction.id,
              projectId,
              actionId: "observation-add-to-dataset" as const,
              tableName: BatchTableNames.Observations,
              cutoffCreatedAt: new Date(),
              query,
              config,
              type: BatchActionType.Create,
            },
          },
          {
            jobId: tableBatchAction.id,
          },
        );

        return { id: tableBatchAction.id };
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

        // Test JSON paths and apply mapping
        const errors: string[] = [];

        // Test each JSON path in the mapping
        const testJsonPaths = (
          mappings: Array<{
            sourceField: "input" | "output" | "metadata";
            jsonPath?: string;
          }>,
          fieldName: string,
        ) => {
          for (const mapping of mappings) {
            if (mapping.jsonPath) {
              const sourceData =
                observationData[
                  mapping.sourceField as keyof typeof observationData
                ];
              const result = testJsonPath({
                jsonPath: mapping.jsonPath,
                data: sourceData,
              });
              if (!result.success) {
                errors.push(
                  `Invalid JSON path "${mapping.jsonPath}" for ${fieldName}.${mapping.sourceField}: ${result.error}`,
                );
              }
            }
          }
        };

        testJsonPaths(input.mapping.inputMappings, "input");
        if (input.mapping.expectedOutputMappings) {
          testJsonPaths(input.mapping.expectedOutputMappings, "expectedOutput");
        }
        if (input.mapping.metadataMappings) {
          testJsonPaths(input.mapping.metadataMappings, "metadata");
        }

        // If JSON path validation failed, return early
        if (errors.length > 0) {
          return {
            success: false,
            preview: null,
            validationErrors: errors,
          };
        }

        // Apply mapping
        const transformedInput = applyFieldMapping({
          observation: observationData,
          mappings: input.mapping.inputMappings,
        });
        const transformedOutput = input.mapping.expectedOutputMappings
          ? applyFieldMapping({
              observation: observationData,
              mappings: input.mapping.expectedOutputMappings,
            })
          : null;
        const transformedMetadata = input.mapping.metadataMappings
          ? applyFieldMapping({
              observation: observationData,
              mappings: input.mapping.metadataMappings,
            })
          : null;

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
          input: transformedInput,
          expectedOutput: transformedOutput,
          metadata: transformedMetadata,
          normalizeOpts: { sanitizeControlChars: true },
          validateOpts: { normalizeUndefinedToNull: true },
        });

        if (!validationResult.success) {
          return {
            success: false,
            preview: {
              input: transformedInput,
              expectedOutput: transformedOutput,
              metadata: transformedMetadata,
            },
            validationErrors: [validationResult.message],
          };
        }

        return {
          success: true,
          preview: {
            input: transformedInput,
            expectedOutput: transformedOutput,
            metadata: transformedMetadata,
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
