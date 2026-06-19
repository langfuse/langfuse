import { Prisma } from "@prisma/client";
import { prisma } from "../../../db";
import {
  type ObservationIoParserConfigDomain,
  ObservationIoParserConfigDomainSchema,
  type ObservationIoParserConfigListItem,
  ObservationIoParserConfigListItemSchema,
  type ObservationIoParserProjectPreferenceDomain,
  ObservationIoParserProjectPreferenceSchema,
  type ObservationIoParserResolvedPreference,
  type ObservationIoParserUserPreferenceDomain,
  ObservationIoParserUserPreferenceSchema,
} from "../../../domain/observation-io-parser-configs";
import { LangfuseConflictError, LangfuseNotFoundError } from "../../../errors";
import type {
  CreateObservationIoParserConfigInput,
  DeleteObservationIoParserConfigInput,
  SetObservationIoParserProjectPreferenceInput,
  SetObservationIoParserUserPreferenceInput,
  UpdateObservationIoParserConfigInput,
} from "./types";

const OBSERVATION_IO_PARSER_DUPLICATE_NAME_MESSAGE =
  "Observation IO parser with this name already exists. Please choose a different name.";

const throwObservationIoParserConflictIfDuplicateName = (
  error: unknown,
): never => {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    throw new LangfuseConflictError(
      OBSERVATION_IO_PARSER_DUPLICATE_NAME_MESSAGE,
    );
  }

  throw error;
};

const toConfigDomain = (record: unknown): ObservationIoParserConfigDomain =>
  ObservationIoParserConfigDomainSchema.parse(record);

const toConfigListItem = (record: unknown): ObservationIoParserConfigListItem =>
  ObservationIoParserConfigListItemSchema.parse(record);

const getDefaultProjectPreference = (
  projectId: string,
): ObservationIoParserProjectPreferenceDomain => ({
  projectId,
  userId: null,
  enabled: false,
  selectedConfigId: null,
  createdAt: null,
  updatedAt: null,
  updatedBy: null,
});

const getDefaultUserPreference = (
  projectId: string,
  userId: string,
): ObservationIoParserUserPreferenceDomain => ({
  projectId,
  userId,
  enabled: true,
  selectedConfigId: null,
  createdAt: null,
  updatedAt: null,
  updatedBy: null,
});

export class ObservationIoParserConfigService {
  public static async listConfigs(
    projectId: string,
  ): Promise<ObservationIoParserConfigListItem[]> {
    const records = await prisma.observationIoParserConfig.findMany({
      where: { projectId },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
      include: {
        createdByUser: {
          select: {
            image: true,
            name: true,
          },
        },
      },
    });

    return records.map(toConfigListItem);
  }

  public static async listActiveConfigs(
    projectId: string,
  ): Promise<ObservationIoParserConfigDomain[]> {
    const records = await prisma.observationIoParserConfig.findMany({
      where: {
        projectId,
        enabled: true,
      },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    });

    return records.map(toConfigDomain);
  }

  public static async createConfig(
    input: CreateObservationIoParserConfigInput,
    createdBy?: string,
  ): Promise<ObservationIoParserConfigDomain> {
    const priority =
      input.priority ??
      (await prisma.observationIoParserConfig.count({
        where: { projectId: input.projectId },
      }));

    try {
      const record = await prisma.observationIoParserConfig.create({
        data: {
          projectId: input.projectId,
          name: input.name,
          description: input.description ?? null,
          enabled: input.enabled,
          priority,
          filters: input.filters,
          instructions: input.instructions,
          createdBy,
          updatedBy: createdBy,
        },
      });

      return toConfigDomain(record);
    } catch (error) {
      return throwObservationIoParserConflictIfDuplicateName(error);
    }
  }

  public static async updateConfig(
    input: UpdateObservationIoParserConfigInput,
    updatedBy?: string,
  ): Promise<ObservationIoParserConfigDomain> {
    const existingConfig = await prisma.observationIoParserConfig.findFirst({
      where: {
        id: input.id,
        projectId: input.projectId,
      },
    });

    if (!existingConfig) {
      throw new LangfuseNotFoundError(
        `Observation IO parser not found in project ${input.projectId}`,
      );
    }

    try {
      const record = await prisma.observationIoParserConfig.update({
        where: {
          id: input.id,
          projectId: input.projectId,
        },
        data: {
          name: input.name,
          description: input.description ?? null,
          enabled: input.enabled,
          priority: input.priority ?? existingConfig.priority,
          filters: input.filters,
          instructions: input.instructions,
          updatedBy,
        },
      });

      return toConfigDomain(record);
    } catch (error) {
      return throwObservationIoParserConflictIfDuplicateName(error);
    }
  }

  public static async deleteConfig(
    input: DeleteObservationIoParserConfigInput,
  ): Promise<void> {
    await prisma.observationIoParserConfig.delete({
      where: {
        id: input.id,
        projectId: input.projectId,
      },
    });
  }

  private static async assertSelectedConfigExists(
    projectId: string,
    selectedConfigId: string | null | undefined,
  ): Promise<void> {
    if (!selectedConfigId) {
      return;
    }

    const selectedConfig = await prisma.observationIoParserConfig.findFirst({
      where: {
        id: selectedConfigId,
        projectId,
      },
      select: { id: true },
    });

    if (!selectedConfig) {
      throw new LangfuseNotFoundError(
        `Observation IO parser not found in project ${projectId}`,
      );
    }
  }

  private static async setScopedPreference(input: {
    projectId: string;
    userId: string | null;
    enabled: boolean;
    selectedConfigId?: string | null;
    updatedBy?: string;
  }) {
    await ObservationIoParserConfigService.assertSelectedConfigExists(
      input.projectId,
      input.selectedConfigId,
    );

    return prisma.$transaction(
      async (tx) => {
        const existing = await tx.observationIoParserPreference.findFirst({
          where: {
            projectId: input.projectId,
            userId: input.userId,
          },
        });

        const updateData = {
          enabled: input.enabled,
          ...(input.selectedConfigId !== undefined
            ? { selectedConfigId: input.selectedConfigId }
            : {}),
          updatedBy: input.updatedBy,
        };

        if (existing) {
          return tx.observationIoParserPreference.update({
            where: { id: existing.id },
            data: updateData,
          });
        }

        return tx.observationIoParserPreference.create({
          data: {
            projectId: input.projectId,
            userId: input.userId,
            enabled: input.enabled,
            selectedConfigId: input.selectedConfigId ?? null,
            updatedBy: input.updatedBy,
          },
        });
      },
      { isolationLevel: "Serializable" },
    );
  }

  public static async getProjectPreference(
    projectId: string,
  ): Promise<ObservationIoParserProjectPreferenceDomain> {
    const record = await prisma.observationIoParserPreference.findFirst({
      where: {
        projectId,
        userId: null,
      },
    });

    return ObservationIoParserProjectPreferenceSchema.parse(
      record ?? getDefaultProjectPreference(projectId),
    );
  }

  public static async setProjectPreference(
    input: SetObservationIoParserProjectPreferenceInput,
    updatedBy?: string,
  ): Promise<ObservationIoParserProjectPreferenceDomain> {
    const record = await ObservationIoParserConfigService.setScopedPreference({
      ...input,
      userId: null,
      updatedBy,
    });

    return ObservationIoParserProjectPreferenceSchema.parse(record);
  }

  public static async getUserPreference(
    projectId: string,
    userId: string,
  ): Promise<ObservationIoParserUserPreferenceDomain> {
    const record = await prisma.observationIoParserPreference.findFirst({
      where: {
        projectId,
        userId,
      },
    });

    return ObservationIoParserUserPreferenceSchema.parse(
      record ?? getDefaultUserPreference(projectId, userId),
    );
  }

  public static async setUserPreference(
    input: SetObservationIoParserUserPreferenceInput,
    userId: string,
  ): Promise<ObservationIoParserUserPreferenceDomain> {
    const record = await ObservationIoParserConfigService.setScopedPreference({
      ...input,
      userId,
      updatedBy: userId,
    });

    return ObservationIoParserUserPreferenceSchema.parse(record);
  }

  public static async getResolvedPreference(
    projectId: string,
    userId?: string,
  ): Promise<ObservationIoParserResolvedPreference> {
    const [projectPreference, userPreference] = await Promise.all([
      ObservationIoParserConfigService.getProjectPreference(projectId),
      userId
        ? ObservationIoParserConfigService.getUserPreference(projectId, userId)
        : null,
    ]);

    if (!projectPreference.enabled) {
      return {
        enabled: false,
        disabledScope: "project",
        selectedConfigId: null,
      };
    }

    if (userPreference && !userPreference.enabled) {
      return {
        enabled: false,
        disabledScope: "user",
        selectedConfigId: userPreference.selectedConfigId,
      };
    }

    return {
      enabled: true,
      disabledScope: null,
      selectedConfigId:
        userPreference?.selectedConfigId ?? projectPreference.selectedConfigId,
    };
  }
}
