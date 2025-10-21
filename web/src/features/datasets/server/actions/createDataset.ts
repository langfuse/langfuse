import {
  DatasetNameSchema,
  InvalidRequestError,
  type Prisma,
  type PrismaClient,
} from "@langfuse/shared";

type DatasetJson =
  | Prisma.InputJsonObject
  | Prisma.JsonValue
  | typeof Prisma.DbNull;

type UpsertDatasetInput = {
  name: string;
  description?: string;
  metadata?: DatasetJson;
};

type UpdateDatasetInput = {
  id: string;
  name?: string;
  description?: string;
  metadata?: DatasetJson;
  remoteExperimentUrl?: string | null;
  remoteExperimentPayload?: DatasetJson;
};

export const upsertDataset = async ({
  input,
  projectId,
  prisma,
}: {
  input: UpsertDatasetInput;
  projectId: string;
  prisma: PrismaClient;
}) => {
  const validation = DatasetNameSchema.safeParse(input.name);
  if (!validation.success) {
    throw new InvalidRequestError(
      "Dataset name not valid. " + validation.error.message,
    );
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
      projectId,
    },
    update: {
      description: input.description ?? undefined,
      metadata: input.metadata ?? undefined,
    },
  });
};

export const updateDataset = async ({
  input,
  projectId,
  prisma,
}: {
  input: UpdateDatasetInput;
  projectId: string;
  prisma: PrismaClient;
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
    },
  });
};
