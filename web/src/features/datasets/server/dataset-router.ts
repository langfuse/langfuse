import { z } from "zod/v4";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { Prisma, type Dataset } from "@langfuse/shared/src/db";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { DB } from "@/src/server/db";
import {
  paginationZod,
  DatasetStatus,
  singleFilter,
  StringNoHTML,
  StringNoHTMLNonEmpty,
  type FilterState,
  isPresent,
  TracingSearchType,
  timeFilter,
  isClickhouseFilterColumn,
  optionalPaginationZod,
  LangfuseConflictError,
} from "@langfuse/shared";
import { TRPCError } from "@trpc/server";
import {
  datasetRunsTableSchema,
  datasetRunTableMetricsSchema,
  enrichAndMapToDatasetItemId,
  fetchDatasetItems,
  getRunItemsByRunIdOrItemId,
} from "@/src/features/datasets/server/service";
import {
  logger,
  addToDeleteDatasetQueue,
  getDatasetRunItemsByDatasetIdCh,
  getDatasetRunItemsCountByDatasetIdCh,
  getDatasetRunsTableMetricsCh,
  getScoresForDatasetRuns,
  getTraceScoresForDatasetRuns,
  getDatasetRunItemsCountCh,
  getNumericScoresGroupedByName,
  getCategoricalScoresGroupedByName,
  getDatasetRunsTableRowsCh,
  getDatasetRunsTableCountCh,
  validateWebhookURL,
  getDatasetRunItemsWithoutIOByItemIds,
  getDatasetItemsWithRunDataCount,
  getDatasetItemIdsWithRunData,
} from "@langfuse/shared/src/server";
import { createId as createCuid } from "@paralleldrive/cuid2";
import { aggregateScores } from "@/src/features/scores/lib/aggregateScores";
import {
  updateDataset,
  upsertDataset,
} from "@/src/features/datasets/server/actions/createDataset";
import {
  validateAllDatasetItems,
  validateDatasetItemField,
  validateDatasetItemData,
  DatasetJSONSchema,
  type DatasetMutationResult,
} from "@langfuse/shared/src/server";
import { type BulkDatasetItemValidationError } from "@langfuse/shared";

/**
 * Remove problematic C0 and C1 control characters from string values.
 * PostgreSQL TEXT columns cannot store NULL byte (\u0000) and other control characters.
 * Preserves common characters like newlines and tabs.
 */
const cleanControlChars = (input: string): string => {
  if (!input) return input;

  // Remove control characters:
  // \u0000-\u0008: NULL through backspace
  // \u000B: vertical tab (preserve \n=\u000A, \t=\u0009, \r=\u000D)
  // \u000E-\u001F: shift out through unit separator
  // \u007F-\u009F: DEL + C1 controls
  return input.replace(/[\u0000-\u0008\u000B\u000E-\u001F\u007F-\u009F]/g, "");
};

/**
 * Recursively clean control characters from all string values in a JSON structure.
 * This handles strings within objects and arrays after JSON.parse.
 */
const sanitizeJsonValue = (value: unknown): unknown => {
  if (typeof value === "string") {
    return cleanControlChars(value);
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeJsonValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, sanitizeJsonValue(v)]),
    );
  }
  return value;
};

const formatDatasetItemData = (data: string | null | undefined) => {
  if (data === "") return Prisma.DbNull;

  try {
    const parsed = !!data ? JSON.parse(data) : undefined;
    // Sanitize control characters from parsed object before sending to PostgreSQL
    return parsed
      ? (sanitizeJsonValue(parsed) as Prisma.InputJsonObject)
      : undefined;
  } catch (e) {
    logger.info(
      "[trpc.datasets.formatDatasetItemData] failed to parse dataset item data",
      e,
    );

    return undefined;
  }
};

/**
 * Adds a case-insensitive search condition to a Kysely query
 * @param searchQuery The search term (optional)
 * @returns The search condition
 */
const resolveSearchCondition = (searchQuery?: string | null) => {
  if (!searchQuery || searchQuery.trim() === "") return Prisma.empty;

  // Add case-insensitive search condition
  return Prisma.sql`AND d.name ILIKE ${`%${searchQuery}%`}`;
};

/**
 * Determines whether the given filters require Dataset Run Items (DRI) metrics from ClickHouse.
 *
 * @param filters - Array of filter conditions to evaluate
 * @returns true if any filter requires DRI metrics, false if using basic dataset run data is sufficient
 */
export const requiresClickhouseLookups = (filters: FilterState): boolean => {
  if (filters.length === 0) {
    return false;
  }

  return filters.some((filter) => {
    return isClickhouseFilterColumn(filter.column);
  });
};

const resolveMetadata = (metadata: string | null | undefined) => {
  if (metadata === "") return Prisma.DbNull;
  try {
    return !!metadata
      ? (JSON.parse(metadata) as Prisma.InputJsonObject)
      : undefined;
  } catch (e) {
    logger.info(
      "[trpc.datasets.resolveMetadata] failed to parse dataset metadata",
      e,
    );
    return undefined;
  }
};

/**
 * Normalizes a value for Prisma UPDATE operations
 * - undefined = don't update field
 * - null = set to DbNull (SQL NULL)
 * - value = set to value
 */
const normalizeForUpdate = (
  value: Prisma.InputJsonObject | null | undefined,
) => (value === undefined ? undefined : value === null ? Prisma.DbNull : value);

/**
 * Validates dataset item data (both input and expectedOutput) and throws TRPCError if invalid
 * Uses shared validation service for consistency between tRPC and Public API
 *
 * @param normalizeUndefinedToNull - Set to true for CREATE operations where undefined becomes null in DB
 */
const validateAndThrowIfInvalid = (params: {
  input: unknown;
  expectedOutput: unknown;
  inputSchema: Record<string, unknown> | null | undefined;
  expectedOutputSchema: Record<string, unknown> | null | undefined;
  normalizeUndefinedToNull?: boolean;
}) => {
  const result = validateDatasetItemData({
    input: params.input,
    expectedOutput: params.expectedOutput,
    inputSchema: params.inputSchema,
    expectedOutputSchema: params.expectedOutputSchema,
    normalizeUndefinedToNull: params.normalizeUndefinedToNull,
  });

  if (!result.isValid) {
    const errorMessages: string[] = [];
    if (result.inputErrors) {
      errorMessages.push(
        `Input validation failed: ${result.inputErrors.map((e) => e.message).join(", ")}`,
      );
    }
    if (result.expectedOutputErrors) {
      errorMessages.push(
        `Expected output validation failed: ${result.expectedOutputErrors.map((e) => e.message).join(", ")}`,
      );
    }

    throw new TRPCError({
      code: "BAD_REQUEST",
      message: errorMessages.join("; "),
      cause: {
        inputErrors: result.inputErrors,
        expectedOutputErrors: result.expectedOutputErrors,
      },
    });
  }
};

/**
 * Validates bulk items and returns validation errors
 * For all-or-nothing CREATE operations - caller should block entire operation if any errors
 */
const validateBulkDatasetItems = (params: {
  items: Array<{
    id: string;
    input: unknown;
    expectedOutput: unknown;
    datasetId: string;
  }>;
  datasetSchemas: Map<
    string,
    { inputSchema: unknown; expectedOutputSchema: unknown }
  >;
}): BulkDatasetItemValidationError[] => {
  const validationErrors: BulkDatasetItemValidationError[] = [];

  for (let i = 0; i < params.items.length; i++) {
    const item = params.items[i];
    const schemas = params.datasetSchemas.get(item.datasetId);

    if (schemas) {
      // Validate input
      if (schemas.inputSchema) {
        const valueToValidate =
          item.input === undefined || item.input === null ? null : item.input;

        const result = validateDatasetItemField({
          data: valueToValidate,
          schema: schemas.inputSchema as Record<string, unknown>,
          itemId: item.id,
          field: "input",
        });
        if (!result.isValid) {
          validationErrors.push({
            itemIndex: i,
            field: "input",
            errors: result.errors,
          });
        }
      }

      // Validate expected output
      if (schemas.expectedOutputSchema) {
        const valueToValidate =
          item.expectedOutput === undefined || item.expectedOutput === null
            ? null
            : item.expectedOutput;

        const result = validateDatasetItemField({
          data: valueToValidate,
          schema: schemas.expectedOutputSchema as Record<string, unknown>,
          itemId: item.id,
          field: "expectedOutput",
        });
        if (!result.isValid) {
          validationErrors.push({
            itemIndex: i,
            field: "expectedOutput",
            errors: result.errors,
          });
        }
      }
    }
  }

  return validationErrors;
};

type GenerateDatasetQueryInput = {
  select: Prisma.Sql;
  projectId: string;
  pathFilter: Prisma.Sql;
  searchFilter: Prisma.Sql;
  orderCondition?: Prisma.Sql;
  limit?: number;
  page?: number;
  pathPrefix?: string;
};

const generateDatasetQuery = ({
  select,
  projectId,
  pathFilter,
  orderCondition = Prisma.empty,
  searchFilter = Prisma.empty,
  pathPrefix = "",
  limit = 1,
  page = 0,
}: GenerateDatasetQueryInput) => {
  // CTE to get datasets for given project (same for root and folder queries)
  const datasetsCTE = Prisma.sql`
  filtered_datasets AS (
   SELECT d.*
   FROM datasets d
   WHERE d.project_id = ${projectId}
     ${pathFilter}
     ${searchFilter}
  )`;

  // Common ORDER BY and LIMIT clauses
  const orderAndLimit = Prisma.sql`
   ${orderCondition.sql ? Prisma.sql`ORDER BY datasets.sort_priority, ${Prisma.raw(orderCondition.sql.replace(/ORDER BY /i, ""))}` : Prisma.empty}
   LIMIT ${limit} OFFSET ${page * limit}`;

  if (pathPrefix) {
    // When we're inside a folder, show individual datasets within that folder
    // and folder representatives for subfolders

    return Prisma.sql`
    WITH ${datasetsCTE},
    individual_datasets_in_folder AS (
      /* Individual datasets exactly at this folder level (no deeper slashes) */
      SELECT
        d.id,
        SUBSTRING(d.name, CHAR_LENGTH(${pathPrefix}) + 2) as name, -- Remove prefix, show relative name
        d.description,
        d.metadata,
        d.project_id,
        d.updated_at,
        d.created_at,
        d.input_schema,
        d.expected_output_schema,
        2 as sort_priority, -- Individual datasets second
        'dataset'::text as row_type  -- Mark as individual dataset
      FROM filtered_datasets d 
      WHERE SUBSTRING(d.name, CHAR_LENGTH(${pathPrefix}) + 2) NOT LIKE '%/%'
        AND SUBSTRING(d.name, CHAR_LENGTH(${pathPrefix}) + 2) != ''  -- Exclude datasets that match prefix exactly
        AND d.name != ${pathPrefix}  -- Additional safety check
    ),
    subfolder_representatives AS (
      /* Folder representatives for deeper nested datasets */
      SELECT
        d.id,
        SPLIT_PART(SUBSTRING(d.name, CHAR_LENGTH(${pathPrefix}) + 2), '/', 1) as name, -- First segment after prefix
        d.description,
        d.metadata,
        d.project_id,
        d.updated_at,
        d.created_at,
        d.input_schema,
        d.expected_output_schema,
        1 as sort_priority, -- Folders first
        'folder'::text as row_type, -- Mark as folder representative
        ROW_NUMBER() OVER (
          PARTITION BY SPLIT_PART(SUBSTRING(d.name, CHAR_LENGTH(${pathPrefix}) + 2), '/', 1)
          ORDER BY LENGTH(d.name) - LENGTH(REPLACE(d.name, '/', '')) ASC, d.created_at DESC
        ) AS rn
      FROM filtered_datasets d
      WHERE SUBSTRING(d.name, CHAR_LENGTH(${pathPrefix}) + 2) LIKE '%/%'
    ),
    combined AS (
      SELECT
        id, name, description, metadata, project_id, updated_at, created_at, sort_priority, row_type, input_schema, expected_output_schema
      FROM individual_datasets_in_folder
      UNION ALL
      SELECT
        id, name, description, metadata, project_id, updated_at, created_at, sort_priority, row_type, input_schema, expected_output_schema
      FROM subfolder_representatives WHERE rn = 1
    )
    SELECT
      ${select}
    FROM combined d
    ${orderAndLimit}
    `;
  } else {
    const baseColumns = Prisma.sql`id, name, description, metadata, project_id, updated_at, created_at, input_schema, expected_output_schema`;

    // When we're at the root level, show all individual datasets that don't have folders
    // and one representative per folder for datasets that do have folders
    return Prisma.sql`
    WITH ${datasetsCTE},
    individual_datasets AS (
      /* Individual datasets without folders */
      SELECT d.id, d.name, d.description, d.metadata, d.project_id, d.updated_at, d.created_at, d.input_schema, d.expected_output_schema, 'dataset'::text as row_type
      FROM filtered_datasets d
      WHERE d.name NOT LIKE '%/%'
    ),
    folder_representatives AS (
      /* One representative per folder - return folder name, not full dataset name */
      SELECT
        d.id,
        SPLIT_PART(d.name, '/', 1) as name,  -- Return folder segment name instead of full name
        d.description,
        d.metadata,
        d.project_id,
        d.updated_at,
        d.created_at,
        d.input_schema,
        d.expected_output_schema,
        'folder'::text as row_type, -- Mark as folder representative
        ROW_NUMBER() OVER (PARTITION BY SPLIT_PART(d.name, '/', 1) ORDER BY LENGTH(d.name) ASC, d.updated_at DESC) AS rn
      FROM filtered_datasets d
      WHERE d.name LIKE '%/%'
    ),
    combined AS (
      SELECT ${baseColumns}, row_type, 1 as sort_priority  -- Folders first
      FROM folder_representatives WHERE rn = 1
      UNION ALL
      SELECT ${baseColumns}, row_type, 2 as sort_priority  -- Individual datasets second
      FROM individual_datasets
    )
    SELECT
      ${select}
    FROM combined d
    ${orderAndLimit}
    `;
  }
};

export const datasetRouter = createTRPCRouter({
  hasAny: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const dataset = await ctx.prisma.dataset.findFirst({
        where: {
          projectId: input.projectId,
        },
        select: { id: true },
        take: 1,
      });

      return dataset !== null;
    }),
  allDatasetMeta: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      return ctx.prisma.dataset.findMany({
        where: {
          projectId: input.projectId,
        },
        select: {
          id: true,
          name: true,
          inputSchema: true,
          expectedOutputSchema: true,
        },
      });
    }),
  allDatasets: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        searchQuery: z.string().nullable(),
        pathPrefix: z.string().optional(),
        ...paginationZod,
      }),
    )
    .query(async ({ input, ctx }) => {
      // pathFilter: SQL WHERE clause to filter datasets by folder (e.g., "AND d.name LIKE 'folder/%'")
      const pathFilter = input.pathPrefix
        ? (() => {
            const prefix = input.pathPrefix;
            return Prisma.sql` AND (d.name LIKE ${`${prefix}/%`} OR d.name = ${prefix})`;
          })()
        : Prisma.empty;

      const searchFilter = resolveSearchCondition(input.searchQuery);

      // Query for dataset and count
      const [datasets, datasetCount] = await Promise.all([
        // datasets
        ctx.prisma.$queryRaw<
          Array<
            Omit<Dataset, "remoteExperimentUrl" | "remoteExperimentPayload"> & {
              row_type: "folder" | "dataset";
            }
          >
        >(
          generateDatasetQuery({
            select: Prisma.sql`
            d.id,
            d.name,
            d.description,
            d.project_id as "projectId",
            d.created_at as "createdAt",
            d.updated_at as "updatedAt",
            d.metadata,
            d.input_schema as "inputSchema",
            d.expected_output_schema as "expectedOutputSchema",
            d.row_type`,
            projectId: input.projectId,
            limit: input.limit,
            page: input.page,
            pathFilter, // SQL WHERE clause: filters DB to only datasets in current folder, derived from prefix.
            pathPrefix: input.pathPrefix, // Raw folder path: used for segment splitting & folder detection logic
            searchFilter,
          }),
        ),
        // datasetCount
        ctx.prisma.$queryRaw<Array<{ totalCount: bigint }>>(
          generateDatasetQuery({
            select: Prisma.sql`count(*) AS "totalCount"`,
            searchFilter,
            projectId: input.projectId,
            pathFilter,
            pathPrefix: input.pathPrefix,
          }),
        ),
      ]);

      return {
        datasets,
        totalDatasets:
          datasetCount.length > 0 ? Number(datasetCount[0]?.totalCount) : 0,
      };
    }),
  allDatasetsMetrics: protectedProjectProcedure
    .input(z.object({ projectId: z.string(), datasetIds: z.array(z.string()) }))
    .query(async ({ input, ctx }) => {
      if (input.datasetIds.length === 0) return { metrics: [] };

      const query = DB.selectFrom("datasets")
        .leftJoin("dataset_items", (join) =>
          join
            .onRef("datasets.id", "=", "dataset_items.dataset_id")
            .on("dataset_items.project_id", "=", input.projectId),
        )
        .leftJoin("dataset_runs", (join) =>
          join
            .onRef("datasets.id", "=", "dataset_runs.dataset_id")
            .on("dataset_runs.project_id", "=", input.projectId),
        )
        .select(({ eb }) => [
          "datasets.id",
          eb.fn.count("dataset_items.id").distinct().as("countDatasetItems"),
          eb.fn.count("dataset_runs.id").distinct().as("countDatasetRuns"),
          eb.fn.max("dataset_runs.created_at").as("lastRunAt"),
        ])
        .where("datasets.project_id", "=", input.projectId)
        .where("datasets.id", "in", input.datasetIds)
        .groupBy("datasets.id");

      const compiledQuery = query.compile();

      const metrics = await ctx.prisma.$queryRawUnsafe<
        Array<{
          id: string;
          countDatasetItems: number;
          countDatasetRuns: number;
          lastRunAt: Date | null;
        }>
      >(compiledQuery.sql, ...compiledQuery.parameters);

      return { metrics };
    }),
  // counts all dataset run items that match the filter
  countAllDatasetItems: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(), // Required for protectedProjectProcedure
        filter: z.array(singleFilter).nullable(),
      }),
    )
    .query(async ({ input }) => {
      const count = await getDatasetRunItemsCountCh({
        projectId: input.projectId,
        filter: input.filter ?? [],
      });
      return { totalCount: count };
    }),
  byId: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        datasetId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      return ctx.prisma.dataset.findUnique({
        where: {
          id_projectId: {
            id: input.datasetId,
            projectId: input.projectId,
          },
        },
      });
    }),
  runById: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        datasetId: z.string(),
        runId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      return ctx.prisma.datasetRuns.findUnique({
        where: {
          id_projectId: {
            id: input.runId,
            projectId: input.projectId,
          },
          datasetId: input.datasetId,
        },
      });
    }),
  baseRunDataByDatasetId: protectedProjectProcedure
    .input(z.object({ projectId: z.string(), datasetId: z.string() }))
    .query(async ({ input, ctx }) => {
      return ctx.prisma.datasetRuns.findMany({
        where: { datasetId: input.datasetId, projectId: input.projectId },
        select: {
          name: true,
          id: true,
          metadata: true,
          description: true,
          createdAt: true,
        },
      });
    }),
  runsByDatasetId: protectedProjectProcedure
    .input(datasetRunsTableSchema)
    .query(async ({ input, ctx }) => {
      // Use helper function to determine if we need DRI metrics
      if (!requiresClickhouseLookups(input.filter ?? [])) {
        const [runs, totalRuns] = await Promise.all([
          await ctx.prisma.datasetRuns.findMany({
            where: {
              datasetId: input.datasetId,
              projectId: input.projectId,
            },
            orderBy: {
              createdAt: "desc",
            },
            take: input.limit,
            skip:
              isPresent(input.page) && isPresent(input.limit)
                ? input.page * input.limit
                : undefined,
          }),
          // dataset run items will continue to be stored in postgres
          await ctx.prisma.datasetRuns.count({
            where: {
              datasetId: input.datasetId,
              projectId: input.projectId,
            },
          }),
        ]);

        return {
          totalRuns,
          runs,
        };
      } else {
        const [runs, totalRuns] = await Promise.all([
          getDatasetRunsTableRowsCh({
            projectId: input.projectId,
            datasetId: input.datasetId,
            filter: input.filter ?? [],
            limit: isPresent(input.limit) ? input.limit : undefined,
            offset:
              isPresent(input.page) && isPresent(input.limit)
                ? input.page * input.limit
                : undefined,
          }),
          getDatasetRunsTableCountCh({
            projectId: input.projectId,
            datasetId: input.datasetId,
            filter: input.filter ?? [],
          }),
        ]);

        return {
          totalRuns,
          runs,
        };
      }
    }),

  runsByDatasetIdMetrics: protectedProjectProcedure
    .input(datasetRunTableMetricsSchema)
    .query(async ({ input }) => {
      // Get runs that have metrics (only runs with dataset_run_items_rmt)
      const runsWithMetrics = await getDatasetRunsTableMetricsCh({
        projectId: input.projectId,
        datasetId: input.datasetId,
        runIds: input.runIds ?? [],
        filter: input.filter ?? [],
      });

      // Only fetch scores for runs that have metrics (runs without dataset_run_items_rmt won't have trace scores)
      const runsWithMetricsIds = runsWithMetrics.map((run) => run.id);
      const [traceScores, runScores] = await Promise.all([
        runsWithMetricsIds.length > 0
          ? getTraceScoresForDatasetRuns(input.projectId, runsWithMetricsIds)
          : [],
        getScoresForDatasetRuns({
          projectId: input.projectId,
          runIds: runsWithMetrics.map((run) => run.id),
          includeHasMetadata: true,
          excludeMetadata: true,
        }),
      ]);

      // Merge all runs: use metrics where available, defaults otherwise
      const allRuns = runsWithMetrics.map((run) => {
        return {
          id: run.id,
          name: run.name,
          // Use ClickHouse metrics if available, otherwise use defaults for runs without dataset_run_items_rmt
          countRunItems: run.countRunItems ?? 0,
          avgTotalCost: run.avgTotalCost ?? null,
          totalCost: run.totalCost ?? null,
          avgLatency: run.avgLatency ?? null,
          scores: aggregateScores(
            traceScores.filter((s) => s.datasetRunId === run.id),
          ),
          runScores: aggregateScores(
            runScores.filter((s) => s.datasetRunId === run.id),
          ),
        };
      });

      return {
        runs: allRuns,
      };
    }),

  runFilterOptions: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        datasetId: z.string(),
        timestampFilter: timeFilter.optional(),
      }),
    )
    .query(async ({ input }) => {
      const { timestampFilter } = input;

      const [numericScoreNames, categoricalScoreNames] = await Promise.all([
        getNumericScoresGroupedByName(
          input.projectId,
          timestampFilter ? [timestampFilter] : [],
        ),
        getCategoricalScoresGroupedByName(
          input.projectId,
          timestampFilter ? [timestampFilter] : [],
        ),
      ]);

      return {
        agg_scores_avg: numericScoreNames.map((s) => s.name),
        agg_score_categories: categoricalScoreNames,
      };
    }),

  // TODO LFE-6512: only return score options present on the given dataset run
  runItemFilterOptions: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        datasetId: z.string(),
        datasetRunId: z.string().optional(),
        // TODO: make required
        datasetRunIds: z.array(z.string()).optional(),
        timestampFilter: timeFilter.optional(),
      }),
    )
    .query(async ({ input }) => {
      const { projectId, timestampFilter } = input;

      const [numericScoreNames, categoricalScoreNames] = await Promise.all([
        getNumericScoresGroupedByName(
          projectId,
          timestampFilter ? [timestampFilter] : [],
        ),
        getCategoricalScoresGroupedByName(
          projectId,
          timestampFilter ? [timestampFilter] : [],
        ),
      ]);

      return {
        agg_scores_avg: numericScoreNames.map((s) => s.name),
        agg_score_categories: categoricalScoreNames,
      };
    }),

  itemById: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        datasetId: z.string(),
        datasetItemId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      return ctx.prisma.datasetItem.findUnique({
        where: {
          id_projectId: { id: input.datasetItemId, projectId: input.projectId },
          datasetId: input.datasetId,
        },
      });
    }),
  countItemsByDatasetId: protectedProjectProcedure
    .input(z.object({ projectId: z.string(), datasetId: z.string() }))
    .query(async ({ input, ctx }) => {
      return await ctx.prisma.datasetItem.count({
        where: {
          datasetId: input.datasetId,
          projectId: input.projectId,
        },
      });
    }),
  itemsByDatasetId: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        datasetId: z.string(),
        filter: z.array(singleFilter).nullish(),
        searchQuery: z.string().optional(),
        searchType: z.array(TracingSearchType).optional(),
        ...paginationZod,
      }),
    )
    .query(async ({ input, ctx }) => {
      return await fetchDatasetItems({
        projectId: input.projectId,
        datasetId: input.datasetId,
        filter: input.filter ?? [],
        limit: input.limit,
        page: input.page,
        prisma: ctx.prisma,
        searchQuery: input.searchQuery,
        searchType: input.searchType,
      });
    }),

  updateDatasetItem: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        datasetId: z.string(),
        datasetItemId: z.string(),
        input: z.string().optional(),
        expectedOutput: z.string().optional(),
        metadata: z.string().optional(),
        sourceTraceId: z.string().optional(),
        sourceObservationId: z.string().optional(),
        status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "datasets:CUD",
      });

      // Fetch dataset to check for schemas
      const dataset = await ctx.prisma.dataset.findUnique({
        where: {
          id_projectId: { id: input.datasetId, projectId: input.projectId },
        },
        select: { inputSchema: true, expectedOutputSchema: true },
      });

      if (!dataset) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Dataset not found",
        });
      }

      // Parse input and expected output
      const parsedInput: Prisma.InputJsonObject | null | undefined =
        input.input !== undefined
          ? input.input === ""
            ? null
            : (JSON.parse(input.input) as Prisma.InputJsonObject)
          : undefined;

      const parsedExpectedOutput: Prisma.InputJsonObject | null | undefined =
        input.expectedOutput !== undefined
          ? input.expectedOutput === ""
            ? null
            : (JSON.parse(input.expectedOutput) as Prisma.InputJsonObject)
          : undefined;

      // Validate both fields together (only if they're being updated)
      validateAndThrowIfInvalid({
        input: parsedInput,
        expectedOutput: parsedExpectedOutput,
        inputSchema: dataset.inputSchema as Record<string, unknown> | null,
        expectedOutputSchema: dataset.expectedOutputSchema as Record<
          string,
          unknown
        > | null,
        normalizeUndefinedToNull: false, // For UPDATE, undefined means "don't update"
      });

      const datasetItem = await ctx.prisma.datasetItem.update({
        where: {
          id_projectId: {
            id: input.datasetItemId,
            projectId: input.projectId,
          },
          datasetId: input.datasetId,
        },
        data: {
          input: normalizeForUpdate(parsedInput),
          expectedOutput: normalizeForUpdate(parsedExpectedOutput),
          metadata:
            input.metadata === ""
              ? Prisma.DbNull
              : input.metadata !== undefined
                ? (JSON.parse(input.metadata) as Prisma.InputJsonObject)
                : undefined,
          sourceTraceId: input.sourceTraceId,
          sourceObservationId: input.sourceObservationId,
          status: input.status,
        },
      });

      await auditLog({
        session: ctx.session,
        resourceType: "datasetItem",
        resourceId: input.datasetItemId,
        action: "update",
        after: datasetItem,
      });

      return datasetItem;
    }),
  createDataset: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        name: StringNoHTMLNonEmpty,
        description: StringNoHTML.nullish(),
        metadata: z.string().nullish(),
        inputSchema: DatasetJSONSchema.nullish(),
        expectedOutputSchema: DatasetJSONSchema.nullish(),
      }),
    )
    .mutation(async ({ input, ctx }): Promise<DatasetMutationResult> => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "datasets:CUD",
      });

      try {
        const dataset = await upsertDataset({
          input: {
            name: input.name,
            description: input.description ?? undefined,
            metadata: resolveMetadata(input.metadata),
            inputSchema: input.inputSchema,
            expectedOutputSchema: input.expectedOutputSchema,
          },
          projectId: input.projectId,
        });

        await auditLog({
          session: ctx.session,
          resourceType: "dataset",
          resourceId: dataset.id,
          action: "create",
          after: dataset,
        });

        return { success: true, dataset };
      } catch (error) {
        // Check if this is a validation error from upsertDataset
        if (
          error instanceof Error &&
          error.message.includes("Schema validation failed")
        ) {
          // Parse validation errors from message
          const match = error.message.match(/Details: (\[.*\])$/);
          if (match) {
            try {
              const validationErrors = JSON.parse(match[1]);
              return { success: false, validationErrors };
            } catch (e) {
              // Failed to parse, rethrow original error
              throw error;
            }
          }
        }
        // Re-throw non-validation errors
        throw error;
      }
    }),
  updateDataset: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        datasetId: z.string(),
        name: StringNoHTMLNonEmpty.nullish(),
        description: StringNoHTML.nullish(),
        metadata: z.string().nullish(),
        inputSchema: DatasetJSONSchema.nullish(),
        expectedOutputSchema: DatasetJSONSchema.nullish(),
      }),
    )
    .mutation(async ({ input, ctx }): Promise<DatasetMutationResult> => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "datasets:CUD",
      });

      // If schemas are being updated, validate all existing items
      // Fast validation (10K items in <1s) means we can always validate
      if (
        input.inputSchema !== undefined ||
        input.expectedOutputSchema !== undefined
      ) {
        const existingDataset = await ctx.prisma.dataset.findUnique({
          where: {
            id_projectId: {
              id: input.datasetId,
              projectId: input.projectId,
            },
          },
          select: { inputSchema: true, expectedOutputSchema: true },
        });

        if (existingDataset) {
          // Determine the final schemas after update
          const finalInputSchema =
            input.inputSchema !== undefined
              ? input.inputSchema
              : existingDataset.inputSchema;
          const finalExpectedOutputSchema =
            input.expectedOutputSchema !== undefined
              ? input.expectedOutputSchema
              : existingDataset.expectedOutputSchema;

          // Validate all items if at least one schema is being set (not null)
          if (finalInputSchema !== null || finalExpectedOutputSchema !== null) {
            const validationResult = await validateAllDatasetItems({
              datasetId: input.datasetId,
              projectId: input.projectId,
              inputSchema: finalInputSchema as Record<string, unknown> | null,
              expectedOutputSchema: finalExpectedOutputSchema as Record<
                string,
                unknown
              > | null,
              prisma: ctx.prisma,
            });

            if (!validationResult.isValid) {
              // Return validation errors instead of throwing
              return {
                success: false,
                validationErrors: validationResult.errors,
              };
            }
          }
        }
      }

      const dataset = await updateDataset({
        input: {
          id: input.datasetId,
          name: input.name ?? undefined,
          description: input.description ?? undefined,
          metadata: resolveMetadata(input.metadata),
          inputSchema: input.inputSchema,
          expectedOutputSchema: input.expectedOutputSchema,
        },
        projectId: input.projectId,
      });

      await auditLog({
        session: ctx.session,
        resourceType: "dataset",
        resourceId: dataset.id,
        action: "update",
        after: dataset,
      });

      return { success: true, dataset };
    }),
  deleteDataset: protectedProjectProcedure
    .input(z.object({ projectId: z.string(), datasetId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "datasets:CUD",
      });

      try {
        const deletedDataset = await ctx.prisma.dataset.delete({
          where: {
            id_projectId: {
              id: input.datasetId,
              projectId: input.projectId,
            },
          },
        });

        await addToDeleteDatasetQueue({
          deletionType: "dataset",
          projectId: input.projectId,
          datasetId: deletedDataset.id,
        });

        await auditLog({
          session: ctx.session,
          resourceType: "dataset",
          resourceId: deletedDataset.id,
          action: "delete",
          before: deletedDataset,
        });

        return deletedDataset;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2025"
        ) {
          throw new LangfuseConflictError(
            "The dataset you are trying to delete has likely been deleted",
          );
        }
        throw error;
      }
    }),

  deleteDatasetItem: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        datasetId: z.string(),
        datasetItemId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "datasets:CUD",
      });

      // First get the item to use in audit log
      const item = await ctx.prisma.datasetItem.findUnique({
        where: {
          id_projectId: {
            id: input.datasetItemId,
            projectId: input.projectId,
          },
          datasetId: input.datasetId,
        },
      });

      if (!item) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Dataset item not found",
        });
      }

      // Delete the dataset item
      const deletedItem = await ctx.prisma.datasetItem.delete({
        where: {
          id_projectId: {
            id: input.datasetItemId,
            projectId: input.projectId,
          },
          datasetId: input.datasetId,
        },
      });

      await auditLog({
        session: ctx.session,
        resourceType: "datasetItem",
        resourceId: deletedItem.id,
        action: "delete",
        before: item,
      });

      return deletedItem;
    }),
  duplicateDataset: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        datasetId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "datasets:CUD",
      });
      const dataset = await ctx.prisma.dataset.findUnique({
        where: {
          id_projectId: {
            id: input.datasetId,
            projectId: input.projectId,
          },
        },
        include: {
          datasetItems: {
            orderBy: {
              createdAt: "asc",
            },
          },
        },
      });
      if (!dataset) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Dataset not found",
        });
      }

      // find a unique name for the new dataset
      // by appending a counter to the name in case of the name already exists
      // e.g. "Copy of dataset" -> "Copy of dataset (1)"
      const existingDatasetNames = (
        await ctx.prisma.dataset.findMany({
          select: {
            name: true,
          },
          where: {
            projectId: input.projectId,
            name: {
              startsWith: "Copy of " + dataset.name,
            },
          },
        })
      ).map((d) => d.name);
      let counter: number = 0;
      const duplicateDatasetName = (pCounter: number) =>
        pCounter === 0
          ? `Copy of ${dataset.name}`
          : `Copy of ${dataset.name} (${counter})`;
      while (true) {
        if (!existingDatasetNames.includes(duplicateDatasetName(counter))) {
          break;
        }
        counter++;
      }

      const newDataset = await upsertDataset({
        input: {
          name: duplicateDatasetName(counter),
          description: dataset.description ?? undefined,
          metadata: dataset.metadata ?? undefined,
          inputSchema: dataset.inputSchema,
          expectedOutputSchema: dataset.expectedOutputSchema,
        },
        projectId: input.projectId,
      });

      await ctx.prisma.datasetItem.createMany({
        data: dataset.datasetItems.map((item) => ({
          // the items get new ids as they need to be unique on project level
          input: item.input ?? undefined,
          expectedOutput: item.expectedOutput ?? undefined,
          metadata: item.metadata ?? undefined,
          sourceTraceId: item.sourceTraceId,
          sourceObservationId: item.sourceObservationId,
          status: item.status,
          projectId: input.projectId,
          datasetId: newDataset.id,
        })),
      });

      await auditLog({
        session: ctx.session,
        resourceType: "dataset",
        resourceId: newDataset.id,
        action: "create",
        after: newDataset,
      });

      return { id: newDataset.id };
    }),

  createDatasetItem: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        datasetId: z.string(),
        input: z.string().nullish(),
        expectedOutput: z.string().nullish(),
        metadata: z.string().nullish(),
        sourceTraceId: z.string().optional(),
        sourceObservationId: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "datasets:CUD",
      });
      const dataset = await ctx.prisma.dataset.findUnique({
        where: {
          id_projectId: {
            id: input.datasetId,
            projectId: input.projectId,
          },
        },
        select: {
          id: true,
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

      const parsedInput = formatDatasetItemData(input.input);
      const parsedExpectedOutput = formatDatasetItemData(input.expectedOutput);

      // Validate both input and expected output against schemas
      validateAndThrowIfInvalid({
        input: parsedInput,
        expectedOutput: parsedExpectedOutput,
        inputSchema: dataset.inputSchema as Record<string, unknown> | null,
        expectedOutputSchema: dataset.expectedOutputSchema as Record<
          string,
          unknown
        > | null,
        normalizeUndefinedToNull: true, // For CREATE, undefined becomes null in DB
      });

      const datasetItem = await ctx.prisma.datasetItem.create({
        data: {
          input: parsedInput,
          expectedOutput: parsedExpectedOutput,
          metadata: formatDatasetItemData(input.metadata),
          datasetId: input.datasetId,
          sourceTraceId: input.sourceTraceId,
          sourceObservationId: input.sourceObservationId,
          projectId: input.projectId,
        },
      });

      await auditLog({
        session: ctx.session,
        resourceType: "datasetItem",
        resourceId: datasetItem.id,
        action: "create",
        after: datasetItem,
      });

      return datasetItem;
    }),

  createManyDatasetItems: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        items: z.array(
          z.object({
            datasetId: z.string(),
            input: z.string().nullish(),
            expectedOutput: z.string().nullish(),
            metadata: z.string().nullish(),
            sourceTraceId: z.string().optional(),
            sourceObservationId: z.string().optional(),
          }),
        ),
      }),
    )
    .mutation(
      async ({
        input,
        ctx,
      }): Promise<
        | { success: true }
        | {
            success: false;
            validationErrors: BulkDatasetItemValidationError[];
          }
      > => {
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "datasets:CUD",
        });

        // Verify all datasets exist and belong to the project
        const datasetIds = [
          ...new Set(input.items.map((item) => item.datasetId)),
        ];
        const datasets = await ctx.prisma.dataset.findMany({
          where: {
            id: { in: datasetIds },
            projectId: input.projectId,
          },
          select: {
            id: true,
            inputSchema: true,
            expectedOutputSchema: true,
          },
        });

        if (datasets.length !== datasetIds.length) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "One or more datasets not found",
          });
        }

        // Create a map of dataset schemas for quick lookup
        const datasetSchemaMap = new Map(
          datasets.map((ds) => [
            ds.id,
            {
              inputSchema: ds.inputSchema,
              expectedOutputSchema: ds.expectedOutputSchema,
            },
          ]),
        );

        const itemsWithIds = input.items.map((item) => ({
          id: createCuid(),
          input: formatDatasetItemData(item.input),
          expectedOutput: formatDatasetItemData(item.expectedOutput),
          metadata: formatDatasetItemData(item.metadata),
          datasetId: item.datasetId,
          sourceTraceId: item.sourceTraceId,
          sourceObservationId: item.sourceObservationId,
          projectId: input.projectId,
          status: DatasetStatus.ACTIVE,
        }));

        // Validate all items - all-or-nothing
        const validationErrors = validateBulkDatasetItems({
          items: itemsWithIds,
          datasetSchemas: datasetSchemaMap,
        });

        // If any validation errors, return them instead of throwing
        if (validationErrors.length > 0) {
          return {
            success: false,
            validationErrors,
          };
        }

        // All items valid - create all
        await ctx.prisma.datasetItem.createMany({
          data: itemsWithIds,
        });

        await Promise.all(
          itemsWithIds.map(async (item) =>
            auditLog({
              session: ctx.session,
              resourceType: "datasetItem",
              resourceId: item.id,
              action: "create",
              after: item,
            }),
          ),
        );

        return { success: true };
      },
    ),
  runItemsByItemId: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        datasetId: z.string(),
        datasetItemId: z.string(),
        datasetRunIds: z.array(z.string()).optional(),
        ...optionalPaginationZod,
      }),
    )
    .query(async ({ input, ctx }) => {
      const { datasetItemId, datasetId } = input;

      const filter = [
        {
          column: "datasetItemId",
          operator: "any of",
          value: [datasetItemId],
          type: "stringOptions" as const,
        },
        ...(input.datasetRunIds && input.datasetRunIds.length > 0
          ? [
              {
                column: "datasetRunId",
                operator: "any of",
                value: input.datasetRunIds,
                type: "stringOptions" as const,
              },
            ]
          : []),
      ] as FilterState;

      const datasetItem = await ctx.prisma.datasetItem.findFirst({
        where: {
          id: datasetItemId,
          projectId: input.projectId,
        },
      });
      if (!datasetItem) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Dataset item not found",
        });
      }

      const [runItems, totalRunItems] = await Promise.all([
        getDatasetRunItemsByDatasetIdCh({
          projectId: input.projectId,
          datasetId: datasetId,
          filter,
          // ensure consistent ordering with datasets.baseDatasetItemByDatasetId
          // CH run items are created in reverse order as postgres execution path
          // can be refactored once we switch to CH only implementation
          orderBy: [
            {
              column: "createdAt",
              order: "ASC",
            },
            { column: "datasetItemId", order: "DESC" },
          ],
          limit: input.limit ?? undefined,
          offset:
            input.page !== undefined && input.limit !== undefined
              ? input.page * input.limit
              : undefined,
        }),
        getDatasetRunItemsCountByDatasetIdCh({
          projectId: input.projectId,
          datasetId: datasetId,
          filter,
        }),
      ]);

      const enrichedRunItems = await getRunItemsByRunIdOrItemId(
        input.projectId,
        runItems,
      );

      // Note: We early return in case of no run items, when adding parameters here, make sure to update the early return above
      return {
        totalRunItems,
        runItems: enrichedRunItems,
      };
    }),

  runItemsByRunId: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        datasetId: z.string(),
        datasetRunId: z.string(),
        datasetItemIds: z.array(z.string()).optional(),
        filter: z.array(singleFilter),
        ...optionalPaginationZod,
      }),
    )
    .query(async ({ input, ctx }) => {
      const {
        datasetRunId,
        datasetItemIds,
        datasetId,
        filter: userFilter,
      } = input;

      const datasetRun = await ctx.prisma.datasetRuns.findFirst({
        where: {
          id: datasetRunId,
          projectId: input.projectId,
        },
      });

      if (!datasetRun) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Dataset run not found",
        });
      }

      const combinedFilter = [
        ...userFilter,
        {
          column: "datasetRunId",
          operator: "any of",
          value: [datasetRunId],
          type: "stringOptions" as const,
        },
        ...(datasetItemIds && datasetItemIds.length > 0
          ? [
              {
                column: "datasetItemId",
                operator: "any of",
                value: datasetItemIds,
                type: "stringOptions" as const,
              },
            ]
          : []),
      ] as FilterState;

      const [runItems, totalRunItems] = await Promise.all([
        getDatasetRunItemsByDatasetIdCh({
          projectId: input.projectId,
          datasetId: datasetId,
          filter: combinedFilter,
          // ensure consistent ordering with datasets.baseDatasetItemByDatasetId
          // CH run items are created in reverse order as postgres execution path
          // can be refactored once we switch to CH only implementation
          orderBy: [
            {
              column: "createdAt",
              order: "ASC",
            },
            { column: "datasetItemId", order: "DESC" },
          ],
          limit: input.limit ?? undefined,
          offset:
            input.page !== undefined && input.limit !== undefined
              ? input.page * input.limit
              : undefined,
        }),
        getDatasetRunItemsCountByDatasetIdCh({
          projectId: input.projectId,
          datasetId: datasetId,
          filter: combinedFilter,
        }),
      ]);

      const enrichedRunItems = await getRunItemsByRunIdOrItemId(
        input.projectId,
        runItems,
      );

      // Note: We early return in case of no run items, when adding parameters here, make sure to update the early return above
      return {
        totalRunItems,
        runItems: enrichedRunItems,
      };
    }),

  datasetItemsWithRunData: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        datasetId: z.string(),
        runIds: z.array(z.string()),
        filterByRun: z
          .array(
            z.object({ runId: z.string(), filters: z.array(singleFilter) }),
          )
          .nullish(),
        ...paginationZod,
      }),
    )
    .query(async ({ input, ctx }) => {
      const { filterByRun, datasetId, projectId, runIds, limit, page } = input;

      if (runIds.length === 0) {
        return {
          data: [],
          totalCount: 0,
        };
      }

      // Step 1: Return dataset item ids for which the run items match the filters
      const datasetItemIds = await getDatasetItemIdsWithRunData({
        projectId: input.projectId,
        datasetId: datasetId,
        runIds,
        filterByRun: filterByRun ?? [],
        limit: limit,
        offset: page * limit,
      });

      // Step 2: Given dataset item ids, lookup dataset run items in clickhouse
      // Note: for each unique dataset item id and dataset run id combination, we will retrieve a dataset run item
      const datasetRunItems = await getDatasetRunItemsWithoutIOByItemIds({
        projectId: input.projectId,
        datasetId: datasetId,
        runIds,
        datasetItemIds,
      });

      const [runData, items] = await Promise.all([
        enrichAndMapToDatasetItemId(projectId, datasetRunItems),
        ctx.prisma.datasetItem.findMany({
          where: { id: { in: datasetItemIds } },
          select: {
            id: true,
            input: true,
            expectedOutput: true,
            metadata: true,
          },
        }),
      ]);

      return {
        data: items.map((item) => ({
          id: item.id,
          input: item.input,
          expectedOutput: item.expectedOutput,
          metadata: item.metadata,
          runData: runData.get(item.id) ?? {},
        })),
      };
    }),

  runItemCompareCount: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        datasetId: z.string(),
        runIds: z.array(z.string()),
        filterByRun: z
          .array(
            z.object({ runId: z.string(), filters: z.array(singleFilter) }),
          )
          .nullish(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const { filterByRun, datasetId, projectId, runIds } = input;

      // Approach 1: if no filters are set, query postgres for datasets' item count
      if (!filterByRun || filterByRun.length === 0) {
        const datasetItemCount = await ctx.prisma.datasetItem.count({
          where: { datasetId, projectId },
        });

        return {
          totalCount: datasetItemCount,
        };
      } else {
        // Approach 2: if filters are set, rely on clickhouse to return only dataset item count that match the filters
        const datasetItemCount = await getDatasetItemsWithRunDataCount({
          projectId,
          datasetId,
          runIds,
          filterByRun: filterByRun ?? [],
        });

        return {
          totalCount: datasetItemCount,
        };
      }
    }),

  datasetItemsBasedOnTraceOrObservation: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        traceId: z.string(),
        observationId: z.string().optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      return ctx.prisma.datasetItem.findMany({
        where: {
          projectId: input.projectId,
          sourceTraceId: input.traceId,
          sourceObservationId: input.observationId ?? null, // null as it should not include observations from the same trace
        },
        select: {
          dataset: {
            select: {
              id: true,
              name: true,
            },
          },
          id: true,
        },
        orderBy: {
          dataset: {
            name: "asc",
          },
        },
      });
    }),
  deleteDatasetRuns: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        // temporary: make optional to not break existing contracts
        datasetId: z.string().optional(),
        datasetRunIds: z.array(z.string()),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "datasets:CUD",
      });

      // Get all dataset runs first for audit logging
      const datasetRuns = await ctx.prisma.datasetRuns.findMany({
        where: {
          id: { in: input.datasetRunIds },
          projectId: input.projectId,
        },
      });

      // Delete all dataset runs
      await ctx.prisma.datasetRuns.deleteMany({
        where: {
          id: { in: input.datasetRunIds },
          projectId: input.projectId,
        },
      });

      // Trigger async delete of dataset run items
      await addToDeleteDatasetQueue({
        deletionType: "dataset-runs",
        projectId: input.projectId,
        // temporary: while dataset id is optional, we can pull it from the first run
        // users can only use this on pages in UI that are pre-filtered by dataset id
        datasetId: input.datasetId ?? datasetRuns[0].datasetId,
        datasetRunIds: input.datasetRunIds,
      });

      // Log audit entries for each deleted run
      await Promise.all(
        datasetRuns.map((run) =>
          auditLog({
            session: ctx.session,
            resourceType: "datasetRun",
            resourceId: run.id,
            action: "delete",
            before: run,
          }),
        ),
      );

      return datasetRuns;
    }),
  upsertRemoteExperiment: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        datasetId: z.string(),
        url: z.string(),
        defaultPayload: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "datasets:CUD",
      });

      const dataset = await ctx.prisma.dataset.findUnique({
        where: {
          id_projectId: {
            id: input.datasetId,
            projectId: input.projectId,
          },
        },
      });

      if (!dataset) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Dataset not found",
        });
      }

      const updatedDataset = await updateDataset({
        input: {
          id: input.datasetId,
          remoteExperimentUrl: input.url,
          remoteExperimentPayload: input.defaultPayload ?? {},
        },
        projectId: input.projectId,
      });

      await auditLog({
        session: ctx.session,
        resourceType: "dataset",
        resourceId: updatedDataset.id,
        action: "update",
        after: updatedDataset,
      });

      return updatedDataset;
    }),
  getRemoteExperiment: protectedProjectProcedure
    .input(z.object({ projectId: z.string(), datasetId: z.string() }))
    .query(async ({ input, ctx }) => {
      const dataset = await ctx.prisma.dataset.findUnique({
        where: {
          id_projectId: { id: input.datasetId, projectId: input.projectId },
        },
        select: {
          remoteExperimentUrl: true,
          remoteExperimentPayload: true,
        },
      });

      if (!dataset || !dataset.remoteExperimentUrl) return null;

      return {
        url: dataset.remoteExperimentUrl,
        payload: dataset.remoteExperimentPayload,
      };
    }),
  triggerRemoteExperiment: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        datasetId: z.string(),
        payload: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "datasets:CUD",
      });

      const dataset = await ctx.prisma.dataset.findUnique({
        where: {
          id_projectId: {
            id: input.datasetId,
            projectId: input.projectId,
          },
        },
        select: {
          id: true,
          name: true,
          remoteExperimentUrl: true,
          remoteExperimentPayload: true,
        },
      });

      if (!dataset) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Dataset not found",
        });
      }

      if (!dataset.remoteExperimentUrl) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No remote run URL configured for this dataset",
        });
      }

      try {
        await validateWebhookURL(dataset.remoteExperimentUrl);
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Invalid remote run URL: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }

      try {
        const response = await fetch(dataset.remoteExperimentUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            projectId: input.projectId,
            datasetId: input.datasetId,
            datasetName: dataset.name,
            payload: input.payload ?? dataset.remoteExperimentPayload,
          }),
          signal: AbortSignal.timeout(10000), // 10 second timeout
        });

        if (!response.ok) {
          return {
            success: false,
          };
        }

        return {
          success: true,
        };
      } catch (error) {
        if (error instanceof Error) {
          return {
            success: false,
          };
        }
        return {
          success: false,
        };
      }
    }),
  deleteRemoteExperiment: protectedProjectProcedure
    .input(z.object({ projectId: z.string(), datasetId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "datasets:CUD",
      });

      const dataset = await ctx.prisma.dataset.findUnique({
        where: {
          id_projectId: {
            id: input.datasetId,
            projectId: input.projectId,
          },
        },
      });

      if (!dataset) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Dataset not found",
        });
      }

      const updatedDataset = await updateDataset({
        input: {
          id: input.datasetId,
          remoteExperimentUrl: null,
          remoteExperimentPayload: Prisma.DbNull,
        },
        projectId: input.projectId,
      });

      await auditLog({
        session: ctx.session,
        resourceType: "dataset",
        resourceId: updatedDataset.id,
        action: "update",
        after: updatedDataset,
      });

      return updatedDataset;
    }),

  validateDatasetSchema: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        datasetId: z.string(),
        inputSchema: DatasetJSONSchema.nullable(),
        expectedOutputSchema: DatasetJSONSchema.nullable(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "datasets:CUD",
      });

      const dataset = await ctx.prisma.dataset.findUnique({
        where: {
          id_projectId: {
            id: input.datasetId,
            projectId: input.projectId,
          },
        },
      });

      if (!dataset) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Dataset not found",
        });
      }

      const validationResult = await validateAllDatasetItems({
        datasetId: input.datasetId,
        projectId: input.projectId,
        inputSchema: input.inputSchema,
        expectedOutputSchema: input.expectedOutputSchema,
        prisma: ctx.prisma,
      });

      return validationResult;
    }),

  setDatasetSchema: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        datasetId: z.string(),
        inputSchema: DatasetJSONSchema.nullable(),
        expectedOutputSchema: DatasetJSONSchema.nullable(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "datasets:CUD",
      });

      const dataset = await ctx.prisma.dataset.findUnique({
        where: {
          id_projectId: {
            id: input.datasetId,
            projectId: input.projectId,
          },
        },
      });

      if (!dataset) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Dataset not found",
        });
      }

      // Validate all existing items before applying schema
      const validationResult = await validateAllDatasetItems({
        datasetId: input.datasetId,
        projectId: input.projectId,
        inputSchema: input.inputSchema,
        expectedOutputSchema: input.expectedOutputSchema,
        prisma: ctx.prisma,
      });

      if (!validationResult.isValid) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Schema validation failed for ${validationResult.errors.length} item(s)`,
          cause: validationResult.errors,
        });
      }

      // Update dataset with new schemas
      const updatedDataset = await ctx.prisma.dataset.update({
        where: {
          id_projectId: {
            id: input.datasetId,
            projectId: input.projectId,
          },
        },
        data: {
          inputSchema: input.inputSchema ?? Prisma.DbNull,
          expectedOutputSchema: input.expectedOutputSchema ?? Prisma.DbNull,
        },
      });

      // Audit log
      await auditLog({
        session: ctx.session,
        resourceType: "dataset",
        resourceId: input.datasetId,
        action: "updateSchema",
        before: {
          inputSchema: dataset.inputSchema,
          expectedOutputSchema: dataset.expectedOutputSchema,
        },
        after: {
          inputSchema: updatedDataset.inputSchema,
          expectedOutputSchema: updatedDataset.expectedOutputSchema,
        },
      });

      return updatedDataset;
    }),
});
