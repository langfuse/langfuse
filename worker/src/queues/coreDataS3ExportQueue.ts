import { Processor } from "bullmq";
import { Readable } from "node:stream";
import pLimit from "p-limit";
import {
  logger,
  StorageServiceFactory,
  type StorageService,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { env } from "../env";

const CORE_DATA_EXPORT_PAGE_SIZE = 1_000;
const CORE_DATA_EXPORT_PART_SIZE_BYTES = 100 * 1024 * 1024;
// Each table export holds at most one postgres connection at a time (short
// keyset page queries). Keep this below the worker's Prisma pool size
// (default: 5 connections) so other queue jobs on the same worker never
// starve on connection acquisition.
const CORE_DATA_EXPORT_TABLE_CONCURRENCY = 3;

let s3StorageServiceClient: StorageService;

const getS3StorageServiceClient = (bucketName: string): StorageService => {
  if (!s3StorageServiceClient) {
    s3StorageServiceClient = StorageServiceFactory.getInstance({
      bucketName,
      accessKeyId: env.LANGFUSE_S3_CORE_DATA_UPLOAD_ACCESS_KEY_ID,
      secretAccessKey: env.LANGFUSE_S3_CORE_DATA_UPLOAD_SECRET_ACCESS_KEY,
      endpoint: env.LANGFUSE_S3_CORE_DATA_UPLOAD_ENDPOINT,
      region: env.LANGFUSE_S3_CORE_DATA_UPLOAD_REGION,
      forcePathStyle:
        env.LANGFUSE_S3_CORE_DATA_UPLOAD_FORCE_PATH_STYLE === "true",
      awsSse: env.LANGFUSE_S3_CORE_DATA_UPLOAD_SSE,
      awsSseKmsKeyId: env.LANGFUSE_S3_CORE_DATA_UPLOAD_SSE_KMS_KEY_ID,
    });
  }
  return s3StorageServiceClient;
};

type UserCoreDataInput = {
  password: string | null;
  accounts: { provider: string }[];
} & Record<string, unknown>;

// Derives the auth methods per user from the linked next-auth accounts and the
// presence of a password hash ("credentials"). The hash itself must never
// reach the export.
export const mapUserToCoreDataRow = ({
  password,
  accounts,
  ...user
}: UserCoreDataInput) => ({
  ...user,
  authMethods: [
    ...(password ? ["credentials"] : []),
    ...Array.from(new Set(accounts.map((account) => account.provider))),
  ],
});

type JobConfigurationCoreDataInput = {
  evalTemplate: { name: string } | null;
  sampling: { toNumber: () => number };
} & Record<string, unknown>;

// Flattens the joined eval template into a plain column so the export stays
// one JSONL row per configured evaluator. The sampling Decimal is cast to a
// JS number so it lands as a JSON number instead of a quoted string.
export const mapJobConfigurationToCoreDataRow = ({
  evalTemplate,
  sampling,
  ...jobConfiguration
}: JobConfigurationCoreDataInput) => ({
  ...jobConfiguration,
  sampling: sampling.toNumber(),
  evalTemplateName: evalTemplate?.name ?? null,
});

type TablePageArgs<TCursor> = {
  lastRow: TCursor | null;
  take: number;
};

type FetchTablePage<TRow> = (args: {
  lastRow: TRow | null;
  take: number;
}) => Promise<TRow[]>;

async function* createTableJsonlStream<TRow>({
  fetchPage,
  mapRow,
  pageSize,
  onPage,
}: {
  fetchPage: FetchTablePage<TRow>;
  mapRow?: (row: TRow) => unknown;
  pageSize: number;
  onPage?: (pageRowCount: number) => void;
}): AsyncGenerator<string> {
  let lastRow: TRow | null = null;
  let isFirstRow = true;

  while (true) {
    const rows = await fetchPage({ lastRow, take: pageSize });

    if (rows.length === 0) {
      break;
    }

    for (const row of rows) {
      yield `${isFirstRow ? "" : "\n"}${JSON.stringify(mapRow ? mapRow(row) : row)}`;
      isFirstRow = false;
    }

    onPage?.(rows.length);

    if (rows.length < pageSize) {
      break;
    }

    lastRow = rows[rows.length - 1];
  }
}

// Streams a table to S3 as JSONL via keyset pagination so memory usage stays
// O(page size) regardless of table size and no postgres connection is held
// across pages. `fetchPage` must return rows in a stable unique order,
// resuming strictly after `lastRow`.
export const uploadTableCoreDataJsonl = async <TRow>({
  s3Client,
  uploadPrefix,
  tableName,
  fetchPage,
  mapRow,
  pageSize = CORE_DATA_EXPORT_PAGE_SIZE,
}: {
  s3Client: StorageService;
  uploadPrefix: string;
  tableName: string;
  fetchPage: FetchTablePage<TRow>;
  mapRow?: (row: TRow) => unknown;
  pageSize?: number;
}): Promise<void> => {
  logger.info(`[CORE DATA] Exporting table ${tableName}`);

  let rowCount = 0;

  try {
    await s3Client.uploadFileBuffered({
      fileName: `${uploadPrefix}${tableName}.jsonl`,
      fileType: "application/x-ndjson",
      data: Readable.from(
        createTableJsonlStream({
          fetchPage,
          mapRow,
          pageSize,
          onPage: (pageRowCount) => {
            rowCount += pageRowCount;
          },
        }),
      ),
      partSizeBytes: CORE_DATA_EXPORT_PART_SIZE_BYTES,
    });
  } catch (error) {
    logger.error(
      `[CORE DATA] Export of table ${tableName} failed after ${rowCount} rows`,
      error,
    );
    throw error;
  }

  logger.info(`[CORE DATA] Finished table ${tableName} (${rowCount} rows)`);
};

// One entry per exported table. The tableName doubles as the S3 object base
// name — keep names stable, downstream DWH consumers depend on them.
const coreDataTableExports: Array<
  (args: { s3Client: StorageService; uploadPrefix: string }) => Promise<void>
> = [
  (args) =>
    uploadTableCoreDataJsonl({
      ...args,
      tableName: "projects",
      fetchPage: ({ lastRow, take }: TablePageArgs<{ id: string }>) =>
        prisma.project.findMany({
          take,
          ...(lastRow ? { cursor: { id: lastRow.id }, skip: 1 } : {}),
          orderBy: { id: "asc" },
          select: {
            id: true,
            name: true,
            orgId: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
    }),
  (args) =>
    uploadTableCoreDataJsonl({
      ...args,
      tableName: "users",
      fetchPage: ({ lastRow, take }: TablePageArgs<{ id: string }>) =>
        prisma.user.findMany({
          take,
          ...(lastRow ? { cursor: { id: lastRow.id }, skip: 1 } : {}),
          orderBy: { id: "asc" },
          select: {
            id: true,
            name: true,
            admin: true,
            email: true,
            featureFlags: true,
            v4BetaEnabled: true,
            createdAt: true,
            updatedAt: true,
            // password and accounts are mapped to authMethods below and must
            // not be exported as-is
            password: true,
            accounts: {
              select: {
                provider: true,
              },
            },
          },
        }),
      mapRow: mapUserToCoreDataRow,
    }),
  (args) =>
    uploadTableCoreDataJsonl({
      ...args,
      tableName: "organizations",
      fetchPage: ({ lastRow, take }: TablePageArgs<{ id: string }>) =>
        prisma.organization.findMany({
          take,
          ...(lastRow ? { cursor: { id: lastRow.id }, skip: 1 } : {}),
          orderBy: { id: "asc" },
          select: {
            id: true,
            name: true,
            cloudConfig: true,
            sfdcOrgId: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
    }),
  (args) =>
    uploadTableCoreDataJsonl({
      ...args,
      tableName: "orgMemberships",
      fetchPage: ({ lastRow, take }: TablePageArgs<{ id: string }>) =>
        prisma.organizationMembership.findMany({
          take,
          ...(lastRow ? { cursor: { id: lastRow.id }, skip: 1 } : {}),
          orderBy: { id: "asc" },
          select: {
            id: true,
            role: true,
            orgId: true,
            userId: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
    }),
  (args) =>
    uploadTableCoreDataJsonl({
      ...args,
      tableName: "projectMemberships",
      fetchPage: ({
        lastRow,
        take,
      }: TablePageArgs<{ projectId: string; userId: string }>) =>
        prisma.projectMembership.findMany({
          take,
          ...(lastRow
            ? {
                cursor: {
                  projectId_userId: {
                    projectId: lastRow.projectId,
                    userId: lastRow.userId,
                  },
                },
                skip: 1,
              }
            : {}),
          orderBy: [{ projectId: "asc" }, { userId: "asc" }],
          select: {
            role: true,
            projectId: true,
            userId: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
    }),
  (args) =>
    uploadTableCoreDataJsonl({
      ...args,
      tableName: "billingMeterBackup",
      fetchPage: ({
        lastRow,
        take,
      }: TablePageArgs<{
        stripeCustomerId: string;
        meterId: string;
        startTime: Date;
        endTime: Date;
      }>) =>
        prisma.billingMeterBackup.findMany({
          take,
          ...(lastRow
            ? {
                cursor: {
                  stripeCustomerId_meterId_startTime_endTime: {
                    stripeCustomerId: lastRow.stripeCustomerId,
                    meterId: lastRow.meterId,
                    startTime: lastRow.startTime,
                    endTime: lastRow.endTime,
                  },
                },
                skip: 1,
              }
            : {}),
          orderBy: [
            { stripeCustomerId: "asc" },
            { meterId: "asc" },
            { startTime: "asc" },
            { endTime: "asc" },
          ],
        }),
    }),
  (args) =>
    uploadTableCoreDataJsonl({
      ...args,
      tableName: "surveys",
      fetchPage: ({ lastRow, take }: TablePageArgs<{ id: string }>) =>
        prisma.survey.findMany({
          take,
          ...(lastRow ? { cursor: { id: lastRow.id }, skip: 1 } : {}),
          orderBy: { id: "asc" },
          select: {
            id: true,
            surveyName: true,
            response: true,
            userId: true,
            userEmail: true,
            orgId: true,
            createdAt: true,
          },
        }),
    }),
  (args) =>
    uploadTableCoreDataJsonl({
      ...args,
      tableName: "blobStorageIntegrations",
      fetchPage: ({ lastRow, take }: TablePageArgs<{ projectId: string }>) =>
        prisma.blobStorageIntegration.findMany({
          take,
          ...(lastRow
            ? { cursor: { projectId: lastRow.projectId }, skip: 1 }
            : {}),
          orderBy: { projectId: "asc" },
          select: {
            projectId: true,
            type: true,
            bucketName: true,
            prefix: true,
            region: true,
            endpoint: true,
            forcePathStyle: true,
            nextSyncAt: true,
            lastSyncAt: true,
            enabled: true,
            exportFrequency: true,
            fileType: true,
            exportMode: true,
            exportStartDate: true,
            exportSource: true,
            exportFieldGroups: true,
            compressed: true,
            lastError: true,
            lastErrorAt: true,
            lastFailureNotificationSentAt: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
    }),
  (args) =>
    uploadTableCoreDataJsonl({
      ...args,
      tableName: "ssoConfigs",
      // authConfig is excluded as it may contain client secrets
      fetchPage: ({ lastRow, take }: TablePageArgs<{ domain: string }>) =>
        prisma.ssoConfig.findMany({
          take,
          ...(lastRow ? { cursor: { domain: lastRow.domain }, skip: 1 } : {}),
          orderBy: { domain: "asc" },
          select: {
            domain: true,
            authProvider: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
    }),
  (args) =>
    uploadTableCoreDataJsonl({
      ...args,
      tableName: "verifiedDomains",
      fetchPage: ({ lastRow, take }: TablePageArgs<{ id: string }>) =>
        prisma.verifiedDomain.findMany({
          take,
          ...(lastRow ? { cursor: { id: lastRow.id }, skip: 1 } : {}),
          orderBy: { id: "asc" },
          select: {
            id: true,
            organizationId: true,
            domain: true,
            verifiedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
    }),
  (args) =>
    uploadTableCoreDataJsonl({
      ...args,
      tableName: "prompts",
      fetchPage: ({ lastRow, take }: TablePageArgs<{ id: string }>) =>
        prisma.prompt.findMany({
          take,
          ...(lastRow ? { cursor: { id: lastRow.id }, skip: 1 } : {}),
          orderBy: { id: "asc" },
          select: {
            id: true,
            name: true,
            projectId: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
    }),
  (args) =>
    uploadTableCoreDataJsonl({
      ...args,
      tableName: "jobConfigurations",
      // blockMessage is excluded as free-text; the eval template relation is
      // flattened to evalTemplateName below
      fetchPage: ({ lastRow, take }: TablePageArgs<{ id: string }>) =>
        prisma.jobConfiguration.findMany({
          take,
          ...(lastRow ? { cursor: { id: lastRow.id }, skip: 1 } : {}),
          orderBy: { id: "asc" },
          select: {
            id: true,
            projectId: true,
            jobType: true,
            status: true,
            blockedAt: true,
            blockReason: true,
            evalTemplateId: true,
            scoreName: true,
            filter: true,
            targetObject: true,
            variableMapping: true,
            sampling: true,
            delay: true,
            timeScope: true,
            createdAt: true,
            updatedAt: true,
            evalTemplate: {
              select: {
                name: true,
              },
            },
          },
        }),
      mapRow: mapJobConfigurationToCoreDataRow,
    }),
];

export const coreDataS3ExportProcessor: Processor = async (): Promise<void> => {
  if (!env.LANGFUSE_S3_CORE_DATA_UPLOAD_BUCKET) {
    logger.error("[CORE DATA] No bucket name provided for core data S3 export");
    throw new Error(
      "Must provide LANGFUSE_S3_CORE_DATA_UPLOAD_BUCKET to use core data S3 exports",
    );
  }

  logger.info("[CORE DATA] Starting core data S3 export");

  const s3Client = getS3StorageServiceClient(
    env.LANGFUSE_S3_CORE_DATA_UPLOAD_BUCKET,
  );
  const uploadPrefix = env.LANGFUSE_S3_CORE_DATA_UPLOAD_PREFIX;

  const limit = pLimit(CORE_DATA_EXPORT_TABLE_CONCURRENCY);
  const results = await Promise.allSettled(
    coreDataTableExports.map((exportTable) =>
      limit(() => exportTable({ s3Client, uploadPrefix })),
    ),
  );

  const failures = results.filter(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (failures.length > 0) {
    logger.error(
      `[CORE DATA] Core data S3 export failed for ${failures.length} of ${results.length} tables`,
    );
    throw failures[0].reason;
  }

  logger.info("[CORE DATA] Finished core data S3 export");
};
