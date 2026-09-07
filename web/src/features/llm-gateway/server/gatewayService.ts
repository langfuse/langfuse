import type {
  GatewayInstrumentationMode,
  PrismaClient,
} from "@langfuse/shared/src/db";
import { InvalidRequestError } from "@langfuse/shared";
import { invalidateCachedOrgApiKeys } from "@langfuse/shared/src/server";

import { auditLog } from "@/src/features/audit-logs/server";
import type { OrgAuthedContext } from "@/src/server/api/trpc";
import { GatewayRepository } from "./repository";

export class GatewayService {
  private readonly repository: GatewayRepository;

  constructor(private readonly prisma: PrismaClient) {
    this.repository = new GatewayRepository(prisma);
  }

  getConfig(organizationId: string) {
    return this.repository.getConfig(organizationId);
  }

  async updateConfig(params: {
    organizationId: string;
    defaultIngestionProjectId: string | null;
    createProjectName?: string;
    instrumentationMode: GatewayInstrumentationMode;
    session: OrgAuthedContext["session"];
  }) {
    const before = await this.getConfig(params.organizationId);
    let result;
    if (params.createProjectName) {
      try {
        result = await this.repository.createIngestionProjectAndUpsertConfig({
          organizationId: params.organizationId,
          projectName: params.createProjectName,
          createdByUserId: params.session.user.id,
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
    } else {
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
      result = {
        config: await this.repository.upsertConfig({
          organizationId: params.organizationId,
          defaultIngestionProjectId: params.defaultIngestionProjectId,
          instrumentationMode: params.instrumentationMode,
        }),
        project: null,
      };
    }

    await auditLog(
      {
        session: params.session,
        resourceType: "gatewayConfig",
        resourceId: params.organizationId,
        action: before ? "update" : "create",
        before,
        after: result.config,
      },
      this.prisma,
    );
    if (result.project) {
      await auditLog(
        {
          session: params.session,
          resourceType: "project",
          resourceId: result.project.id,
          action: "create",
          after: result.project,
        },
        this.prisma,
      );
      await invalidateCachedOrgApiKeys(params.organizationId);
    }
    return result;
  }
}
