import {
  DatasetNameSchema,
  InvalidRequestError,
  LangfuseConflictError,
  Prisma,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  validateAllDatasetItems,
  type ValidationResult,
} from "@langfuse/shared/src/server";

type DatasetJson =
  | Prisma.InputJsonObject
  | Prisma.JsonValue
  | typeof Prisma.DbNull;

/**
 * Runs validateAllDatasetItems only when a schema is actually changing, using
 * the final (post-update) schema values. Shared by the POST upsert path and
 * the public API PATCH update path so both apply the identical check; each
 * caller decides how to surface a failing ValidationResult.
 */
export const validateDatasetSchemaUpdate = async ({
  projectId,
  datasetId,
  currentInputSchema,
  currentExpectedOutputSchema,
  nextInputSchema,
  nextExpectedOutputSchema,
}: {
  projectId: string;
  datasetId: string;
  currentInputSchema: Record<string, unknown> | null;
  currentExpectedOutputSchema: Record<string, unknown> | null;
  nextInputSchema?: Record<string, unknown> | null;
  nextExpectedOutputSchema?: Record<string, unknown> | null;
}): Promise<ValidationResult | null> => {
  const isSettingInputSchema = nextInputSchema !== undefined;
  const isSettingExpectedOutputSchema = nextExpectedOutputSchema !== undefined;

  if (!isSettingInputSchema && !isSettingExpectedOutputSchema) {
    return null;
  }

  const finalInputSchema = isSettingInputSchema
    ? nextInputSchema
    : currentInputSchema;
  const finalExpectedOutputSchema = isSettingExpectedOutputSchema
    ? nextExpectedOutputSchema
    : currentExpectedOutputSchema;

  if (finalInputSchema === null && finalExpectedOutputSchema === null) {
    return null;
  }

  return validateAllDatasetItems({
    datasetId,
    projectId,
    inputSchema: finalInputSchema,
    expectedOutputSchema: finalExpectedOutputSchema,
  });
};

type UpsertDatasetInput = {
  id?: string;
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
  remoteExperimentEnabled?: boolean;
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
  if (input.id === "") {
    throw new InvalidRequestError("Dataset id must not be empty");
  }

  const validation = DatasetNameSchema.safeParse(input.name);
  if (!validation.success) {
    throw new InvalidRequestError(
      "Dataset name not valid. " + validation.error.message,
    );
  }

  const existingDataset = await prisma.dataset.findUnique({
    where: input.id
      ? {
          id_projectId: {
            id: input.id,
            projectId,
          },
        }
      : {
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

  if (input.id && !existingDataset) {
    const existingDatasetWithName = await prisma.dataset.findUnique({
      where: {
        projectId_name: {
          projectId,
          name: input.name,
        },
      },
      select: {
        id: true,
      },
    });

    if (existingDatasetWithName) {
      throw new LangfuseConflictError("Dataset name already in use");
    }
  }

  // If updating and schemas are being set, validate all existing items
  if (existingDataset) {
    const validationResult = await validateDatasetSchemaUpdate({
      projectId,
      datasetId: existingDataset.id,
      currentInputSchema: existingDataset.inputSchema as Record<
        string,
        unknown
      > | null,
      currentExpectedOutputSchema: existingDataset.expectedOutputSchema as Record<
        string,
        unknown
      > | null,
      nextInputSchema: input.inputSchema as Record<string, unknown> | null,
      nextExpectedOutputSchema: input.expectedOutputSchema as Record<
        string,
        unknown
      > | null,
    });

    if (validationResult && !validationResult.isValid) {
      throw new InvalidRequestError(
        `Schema validation failed for ${validationResult.errors.length === 10 ? "more than 10" : validationResult.errors.length} item(s). Details: ${JSON.stringify(validationResult.errors)}`,
      );
    }
  }

  const data = {
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
  };

  try {
    if (input.id) {
      return await prisma.dataset.upsert({
        where: {
          id_projectId: {
            id: input.id,
            projectId,
          },
        },
        create: {
          id: input.id,
          ...data,
          projectId,
        },
        update: data,
      });
    }

    const { name: _name, ...updateData } = data;

    return await prisma.dataset.upsert({
      where: {
        projectId_name: {
          projectId,
          name: input.name,
        },
      },
      create: {
        ...data,
        projectId,
      },
      update: updateData,
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new LangfuseConflictError("Dataset name already in use");
    }

    throw error;
  }
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
      remoteExperimentEnabled: input.remoteExperimentEnabled ?? undefined,
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
