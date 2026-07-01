import { Processor } from "bullmq";
import { Readable } from "node:stream";
import {
  logger,
  StorageServiceFactory,
  type StorageService,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { env } from "../env";

const PROMPT_EXPORT_PAGE_SIZE = 1_000;
const PROMPT_EXPORT_PART_SIZE_BYTES = 100 * 1024 * 1024;

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

type PromptCoreData = {
  id: string;
  name: string;
  projectId: string;
  createdAt: Date;
  updatedAt: Date;
};

type FetchPromptPage = (args: {
  skip: number;
  take: number;
}) => Promise<PromptCoreData[]>;

async function* createPromptJsonlStream({
  fetchPromptPage,
  pageSize,
}: {
  fetchPromptPage: FetchPromptPage;
  pageSize: number;
}): AsyncGenerator<string> {
  let skip = 0;
  let isFirstRow = true;

  while (true) {
    const prompts = await fetchPromptPage({ skip, take: pageSize });

    if (prompts.length === 0) {
      break;
    }

    for (const prompt of prompts) {
      yield `${isFirstRow ? "" : "\n"}${JSON.stringify(prompt)}`;
      isFirstRow = false;
    }

    if (prompts.length < pageSize) {
      break;
    }

    skip += prompts.length;
  }
}

export const uploadPromptsCoreDataJsonl = async ({
  s3Client,
  uploadPrefix,
  pageSize = PROMPT_EXPORT_PAGE_SIZE,
  fetchPromptPage = (args) =>
    prisma.prompt.findMany({
      ...args,
      orderBy: { id: "asc" },
      select: {
        id: true,
        name: true,
        projectId: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
}: {
  s3Client: StorageService;
  uploadPrefix: string;
  pageSize?: number;
  fetchPromptPage?: FetchPromptPage;
}): Promise<void> => {
  await s3Client.uploadFileBuffered({
    fileName: `${uploadPrefix}prompts.jsonl`,
    fileType: "application/x-ndjson",
    data: Readable.from(createPromptJsonlStream({ fetchPromptPage, pageSize })),
    partSizeBytes: PROMPT_EXPORT_PART_SIZE_BYTES,
  });
};

export const coreDataS3ExportProcessor: Processor = async (): Promise<void> => {
  if (!env.LANGFUSE_S3_CORE_DATA_UPLOAD_BUCKET) {
    logger.error("No bucket name provided for core data S3 export");
    throw new Error(
      "Must provide LANGFUSE_S3_CORE_DATA_UPLOAD_BUCKET to use core data S3 exports",
    );
  }

  logger.info("Starting core data S3 export");

  const s3Client = getS3StorageServiceClient(
    env.LANGFUSE_S3_CORE_DATA_UPLOAD_BUCKET,
  );

  // Fetch table data
  const [
    projects,
    users,
    organizations,
    orgMemberships,
    projectMemberships,
    billingMeterBackup,
    surveys,
    blobStorageIntegrations,
  ] = await Promise.all([
    prisma.project.findMany({
      select: {
        id: true,
        name: true,
        orgId: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.user.findMany({
      select: {
        id: true,
        name: true,
        admin: true,
        email: true,
        featureFlags: true,
        v4BetaEnabled: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.organization.findMany({
      select: {
        id: true,
        name: true,
        cloudConfig: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.organizationMembership.findMany({
      select: {
        id: true,
        role: true,
        orgId: true,
        userId: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.projectMembership.findMany({
      select: {
        role: true,
        projectId: true,
        userId: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.billingMeterBackup.findMany(),
    prisma.survey.findMany({
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
    prisma.blobStorageIntegration.findMany({
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
  ]);

  // Iterate through the tables and upload them to S3 as JSONLs
  await Promise.all(
    Object.entries({
      projects,
      users,
      organizations,
      orgMemberships,
      projectMemberships,
      billingMeterBackup,
      surveys,
      blobStorageIntegrations,
    }).map(async ([key, value]) =>
      s3Client.uploadFile({
        fileName: `${env.LANGFUSE_S3_CORE_DATA_UPLOAD_PREFIX}${key}.jsonl`,
        fileType: "application/x-ndjson",
        data: value.map((item) => JSON.stringify(item)).join("\n"),
      }),
    ),
  );

  await uploadPromptsCoreDataJsonl({
    s3Client,
    uploadPrefix: env.LANGFUSE_S3_CORE_DATA_UPLOAD_PREFIX,
  });

  logger.info("Finished core data S3 export");
};
