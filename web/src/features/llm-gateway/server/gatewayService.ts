import type {
  GatewayInstrumentationMode,
  PrismaClient,
} from "@langfuse/shared/src/db";
import { InvalidRequestError } from "@langfuse/shared";

import { GatewayRepository } from "./repository";

export class GatewayService {
  private readonly repository: GatewayRepository;

  constructor(prisma: PrismaClient) {
    this.repository = new GatewayRepository(prisma);
  }

  getConfig(organizationId: string) {
    return this.repository.getConfig(organizationId);
  }

  async updateConfig(params: {
    organizationId: string;
    defaultIngestionProjectId: string | null;
    createProjectName?: string;
    createdByUserId: string;
    instrumentationMode: GatewayInstrumentationMode;
  }) {
    if (params.createProjectName) {
      try {
        return await this.repository.createIngestionProjectAndUpsertConfig({
          organizationId: params.organizationId,
          projectName: params.createProjectName,
          createdByUserId: params.createdByUserId,
          instrumentationMode: params.instrumentationMode,
        });
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "A project with this name already exists"
        ) {
          throw new InvalidRequestError(error.message);
        }
        throw error;
      }
    }
    if (params.defaultIngestionProjectId) {
      const project = await this.repository.getActiveOrganizationProject({
        organizationId: params.organizationId,
        projectId: params.defaultIngestionProjectId,
      });
      if (!project) {
        throw new InvalidRequestError(
          "Default ingestion project must be an active project in the organization",
        );
      }
    }

    return {
      config: await this.repository.upsertConfig({
        organizationId: params.organizationId,
        defaultIngestionProjectId: params.defaultIngestionProjectId,
        instrumentationMode: params.instrumentationMode,
      }),
      project: null,
    };
  }
}
