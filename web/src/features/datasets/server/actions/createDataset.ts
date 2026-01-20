import {
  DatasetNameSchema,
  InvalidRequestError,
  Prisma,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { validateAllDatasetItems } from "@langfuse/shared/src/server";

type DatasetJson =
  | Prisma.InputJsonObject
  | Prisma.JsonValue
  | typeof Prisma.DbNull;

type UpsertDatasetInput = {
  name: string;
  description?: string;
  metadata?: DatasetJson;
  inputSchema?: DatasetJson;
  expectedOutputSchema?: DatasetJson;
};

type UpdateDatasetInput = {
  id: string;
  name?: string;
  description?: string;
  metadata?: DatasetJson;
  remoteExperimentUrl?: string | null;
  remoteExperimentPayload?: DatasetJson;
  inputSchema?: DatasetJson;
  expectedOutputSchema?: DatasetJson;
};

export const upsertDataset = async ({
  input,
  projectId,
}: {
  input: UpsertDatasetInput;
  projectId: string;
}) => {
  const validation = DatasetNameSchema.safeParse(input.name);
  if (!validation.success) {
    throw new InvalidRequestError(
      "Dataset name not valid. " + validation.error.message,
    );
  }

  // Check if dataset exists (for UPDATE path)
  const existingDataset = await prisma.dataset.findUnique({
    where: {
      projectId_name: {
        projectId,
        name: input.name,
      },
    },
    select: {
      id: true,
      inputSchema: true,
      expectedOutputSchema: true,
    },
  });

  // If updating and schemas are being set, validate all existing items
  if (existingDataset) {
    const isSettingInputSchema = input.inputSchema !== undefined;
    const isSettingExpectedOutputSchema =
      input.expectedOutputSchema !== undefined;

    if (isSettingInputSchema || isSettingExpectedOutputSchema) {
      // Determine final schemas after update
      const finalInputSchema = isSettingInputSchema
        ? input.inputSchema
        : existingDataset.inputSchema;
      const finalExpectedOutputSchema = isSettingExpectedOutputSchema
        ? input.expectedOutputSchema
        : existingDataset.expectedOutputSchema;

      // Validate if any schema is being set (not null)
      if (finalInputSchema !== null || finalExpectedOutputSchema !== null) {
        const validationResult = await validateAllDatasetItems({
          datasetId: existingDataset.id,
          projectId,
          inputSchema: finalInputSchema as Record<string, unknown> | null,
          expectedOutputSchema: finalExpectedOutputSchema as Record<
            string,
            unknown
          > | null,
        });

        if (!validationResult.isValid) {
          throw new InvalidRequestError(
            `Schema validation failed for ${validationResult.errors.length === 10 ? "more than 10" : validationResult.errors.length} item(s). Details: ${JSON.stringify(validationResult.errors)}`,
          );
        }
      }
    }
  }

  return await prisma.dataset.upsert({
    where: {
      projectId_name: {
        projectId,
        name: input.name,
      },
    },
    create: {
      name: input.name,
      description: input.description ?? undefined,
      metadata: input.metadata ?? undefined,
      inputSchema:
        input.inputSchema === undefined
          ? undefined
          : input.inputSchema === null
            ? Prisma.DbNull
            : input.inputSchema,
      expectedOutputSchema:
        input.expectedOutputSchema === undefined
          ? undefined
          : input.expectedOutputSchema === null
            ? Prisma.DbNull
            : input.expectedOutputSchema,
      projectId,
    },
    update: {
      description: input.description ?? undefined,
      metadata: input.metadata ?? undefined,
      inputSchema:
        input.inputSchema === undefined
          ? undefined
          : input.inputSchema === null
            ? Prisma.DbNull
            : input.inputSchema,
      expectedOutputSchema:
        input.expectedOutputSchema === undefined
          ? undefined
          : input.expectedOutputSchema === null
            ? Prisma.DbNull
            : input.expectedOutputSchema,
    },
  });
};

export const updateDataset = async ({
  input,
  projectId,
}: {
  input: UpdateDatasetInput;
  projectId: string;
}) => {
  if (input.name) {
    const validation = DatasetNameSchema.safeParse(input.name);
    if (!validation.success) {
      throw new InvalidRequestError(
        "Dataset name not valid. " + validation.error.message,
      );
    }
  }

  return await prisma.dataset.update({
    where: {
      id_projectId: {
        id: input.id,
        projectId,
      },
    },
    data: {
      name: input.name ?? undefined,
      description: input.description ?? undefined,
      metadata: input.metadata ?? undefined,
      remoteExperimentUrl: input.remoteExperimentUrl,
      remoteExperimentPayload: input.remoteExperimentPayload ?? undefined,
      inputSchema:
        input.inputSchema === undefined
          ? undefined
          : input.inputSchema === null
            ? Prisma.DbNull
            : input.inputSchema,
      expectedOutputSchema:
        input.expectedOutputSchema === undefined
          ? undefined
          : input.expectedOutputSchema === null
            ? Prisma.DbNull
            : input.expectedOutputSchema,
    },
  });
};
