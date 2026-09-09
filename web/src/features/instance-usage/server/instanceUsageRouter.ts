import { TRPCError } from "@trpc/server";
import {
  createTRPCRouter,
  authenticatedProcedure,
} from "@/src/server/api/trpc";
import { env } from "@/src/env.mjs";
import { Role } from "@langfuse/shared/src/db";
import { logger, queryClickhouse } from "@langfuse/shared/src/server";
import { isInstanceUsageAvailable } from "@/src/features/instance-usage/lib/availability";
import {
  INSTANCE_USAGE_STORAGE_TABLES,
  buildMonthlyUsage,
  resolveUsageEntities,
  type InstanceUsagePartitionRow,
  type InstanceUsageResponse,
} from "@/src/features/instance-usage/lib/instanceUsage";

/** The page is an operator tool; see `isInstanceUsageAvailable`. */
const denyOnLangfuseCloud = () => {
  if (!isInstanceUsageAvailable()) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Instance usage is not available in Langfuse Cloud",
    });
  }
};

/**
 * Instance usage aggregates across every organization on the instance, so a
 * plain org membership is not enough. We require an org-level OWNER/ADMIN role
 * somewhere on the instance — the roles a self-hosted operator holds — which
 * keeps the numbers away from regular members and viewers.
 */
const denyNonInstanceOperators = (session: {
  user: {
    admin?: boolean | null;
    organizations: { role: Role }[];
  };
}) => {
  if (session.user.admin === true) return;

  const isOrgOperator = session.user.organizations.some(
    (org) => org.role === Role.OWNER || org.role === Role.ADMIN,
  );
  if (!isOrgOperator) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Instance usage requires an Owner or Admin role in at least one organization",
    });
  }
};

/**
 * Monthly row counts and byte sizes straight from ClickHouse partition
 * metadata.
 *
 * Every tracing table is partitioned by month (`toYYYYMM` of the entity
 * timestamp), so `system.parts` already holds the exact pivot we want and
 * answers in milliseconds regardless of instance size. Counting rows with
 * `SELECT count(*) ... GROUP BY month` instead would scan a year of data on the
 * very instances this page exists for — Langfuse Cloud's hourly metering job
 * already runs into the ClickHouse request-timeout ceiling doing a single-hour
 * count over one of these tables.
 *
 * `system.parts` is read locally, not through `clusterAllReplicas`: Langfuse's
 * clustered schema is single-shard ReplicatedMergeTree, so every replica holds
 * the full dataset and a cluster-wide union would multiply by the replica count.
 */
const getPartitionRows = async (): Promise<InstanceUsagePartitionRow[]> => {
  const rows = await queryClickhouse<{
    table: string;
    partition_id: string;
    rows: string;
    bytes_on_disk: string;
    data_uncompressed_bytes: string;
    part_count: string;
  }>({
    query: `
      SELECT
        table,
        partition_id,
        sum(rows) AS rows,
        sum(bytes_on_disk) AS bytes_on_disk,
        sum(data_uncompressed_bytes) AS data_uncompressed_bytes,
        count() AS part_count
      FROM system.parts
      WHERE database = currentDatabase()
        AND active = 1
        AND table IN ({tables: Array(String)})
        AND match(partition_id, '^[0-9]{6}$')
      GROUP BY table, partition_id
      ORDER BY partition_id DESC, table ASC
    `,
    params: { tables: [...INSTANCE_USAGE_STORAGE_TABLES] },
    tags: {
      surface: "trpc",
      route: "instanceUsage.get",
    },
  });

  return rows.map((row) => ({
    table: row.table,
    month: `${row.partition_id.slice(0, 4)}-${row.partition_id.slice(4, 6)}`,
    rows: Number(row.rows),
    onDiskBytes: Number(row.bytes_on_disk),
    uncompressedBytes: Number(row.data_uncompressed_bytes),
    parts: Number(row.part_count),
  }));
};

export const instanceUsageRouter = createTRPCRouter({
  get: authenticatedProcedure.query(
    async ({ ctx }): Promise<InstanceUsageResponse> => {
      denyOnLangfuseCloud();
      denyNonInstanceOperators(ctx.session);

      const warnings: string[] = [];

      const [
        partitionRows,
        organizations,
        projects,
        users,
        projectsWithRetention,
        postgresBytes,
      ] = await Promise.all([
        getPartitionRows().catch((error) => {
          // A ClickHouse user without `system.parts` access should degrade to an
          // empty table with an explanation, not a broken page.
          logger.error("[INSTANCE USAGE] Failed to read system.parts", {
            error,
          });
          warnings.push(
            "Could not read ClickHouse partition metadata (system.parts). The ClickHouse user needs read access to system tables for usage numbers to appear.",
          );
          return [] as InstanceUsagePartitionRow[];
        }),
        ctx.prisma.organization.count(),
        ctx.prisma.project.count({ where: { deletedAt: null } }),
        ctx.prisma.user.count(),
        ctx.prisma.project.count({
          where: { deletedAt: null, retentionDays: { gt: 0 } },
        }),
        ctx.prisma.$queryRaw<
          { size: bigint }[]
        >`SELECT pg_database_size(current_database()) AS size`
          .then((result) =>
            result[0]?.size != null ? Number(result[0].size) : null,
          )
          .catch((error) => {
            logger.warn("[INSTANCE USAGE] Failed to read Postgres size", {
              error,
            });
            return null;
          }),
      ]);

      const dataModel = env.LANGFUSE_MIGRATION_V4_WRITE_MODE;
      const entities = resolveUsageEntities(dataModel);
      const { months, storage } = buildMonthlyUsage({
        partitionRows,
        entities,
        now: new Date(),
      });

      return {
        generatedAt: new Date().toISOString(),
        instance: {
          dataModel,
          organizations,
          projects,
          users,
          projectsWithRetention,
          postgresBytes,
        },
        entities,
        months,
        storage,
        warnings,
      };
    },
  ),
});
