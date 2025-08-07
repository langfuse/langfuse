import {
  BlobStorageExportMode,
  BlobStorageIntegration,
  BlobStorageIntegrationFileType,
  BlobStorageIntegrationType,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { z } from "zod";

// Unified schema for all table types - type is optional and only used for observations
const LastProcessedKeysSchema = z.object({
  date: z.coerce.date(),
  id: z.string(),
  type: z.string().optional(), // only used for observations table
});

export const BlobStorageIntegrationProgressState = z.object({
  traces: z
    .object({
      completed: z.boolean(),
      lastProcessedKeys: LastProcessedKeysSchema.nullable(),
    })
    .optional(),
  observations: z
    .object({
      completed: z.boolean(),
      lastProcessedKeys: LastProcessedKeysSchema.nullable(),
    })
    .optional(),
  scores: z
    .object({
      completed: z.boolean(),
      lastProcessedKeys: LastProcessedKeysSchema.nullable(),
    })
    .optional(),
});

export type BlobStorageIntegrationProgressState = z.infer<
  typeof BlobStorageIntegrationProgressState
>;

export type BlobStorageIntegrationDomain = {
  projectId: string;
  type: BlobStorageIntegrationType;
  bucketName: string;
  prefix: string;
  accessKeyId: string | null;
  secretAccessKey: string | null;
  region: string;
  endpoint: string | null;
  forcePathStyle: boolean;
  nextSyncAt: Date | null;
  lastSyncAt: Date | null;
  enabled: boolean;
  exportFrequency: string;
  fileType: BlobStorageIntegrationFileType;
  exportMode: BlobStorageExportMode;
  exportStartDate: Date | null;
  progressState: BlobStorageIntegrationProgressState | null;
};

export const convertPrismaToDomain = (
  record: BlobStorageIntegration,
): BlobStorageIntegrationDomain => {
  const { progressState: progressStateRaw, ...rest } = record;

  let progressState: BlobStorageIntegrationProgressState | null = null;

  if (progressStateRaw) {
    try {
      progressState =
        BlobStorageIntegrationProgressState.parse(progressStateRaw);
    } catch (error) {
      // Handle backward compatibility - if parsing fails, set to null
      // This allows the system to start fresh with the new schema
      progressState = null;
    }
  }

  return {
    ...rest,
    progressState,
  };
};

export const getBlobStorageIntegration = async (projectId: string) => {
  const record = await prisma.blobStorageIntegration.findUnique({
    where: { projectId },
  });

  if (!record) {
    return null;
  }

  return convertPrismaToDomain(record);
};
