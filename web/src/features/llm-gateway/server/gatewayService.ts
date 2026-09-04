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
    instrumentationMode: GatewayInstrumentationMode;
  }) {
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

    return this.repository.upsertConfig(params);
  }
}
