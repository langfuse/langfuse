import { InvalidRequestError } from "@langfuse/shared";
import type {
  GatewayIngestionMode,
  Prisma,
  PrismaClient,
} from "@langfuse/shared/src/db";
import {
  auditLog,
  type AuditLogActor,
} from "@/src/features/audit-logs/auditLog";
import type { OrgAuthedContext } from "@/src/server/api/trpc";
import { invalidateGatewayResolveCacheForOrganization } from "@/src/features/ai-gateway/server/resolve/gatewayResolveCache";
import { isGatewayIngestionConfigured } from "@/src/features/ai-gateway/fns/isGatewayIngestionConfigured";
import {
  getEffectiveGatewayIngestionMode,
  isGatewayIngestionModeAvailable,
} from "@/src/features/ai-gateway/fns/gatewayIngestionModePolicy";
import { GatewayConfigRepository } from "./gatewayConfigRepository";

/** The gateway config is org-level; the org audit log only lists entries without a project. */
function withoutProjectContext(actor: AuditLogActor): AuditLogActor {
  if ("session" in actor) {
    return {
      session: {
        ...actor.session,
        projectId: undefined,
        projectRole: undefined,
      },
    };
  }
  return { ...actor, projectId: undefined };
}

export class GatewayConfigService {
  private readonly repository: GatewayConfigRepository;

  constructor(
    private readonly prisma: PrismaClient | Prisma.TransactionClient,
  ) {
    this.repository = new GatewayConfigRepository(prisma);
  }

  /** isIngestionProject reports whether the gateway writes its traces into the project. */
  async isIngestionProject(params: {
    organizationId: string;
    projectId: string;
  }) {
    return (await this.repository.getConfigWritingToProject(params)) !== null;
  }

  /**
   * clearIngestionProject unlinks a project from the gateway, which turns the
   * gateway off until another ingestion project is selected. It returns
   * whether it cleared the link. Run it inside the deleting transaction, then
   * invalidate the gateway resolve cache once that transaction commits.
   */
  async clearIngestionProject(params: {
    organizationId: string;
    projectId: string;
    actor: AuditLogActor;
  }): Promise<boolean> {
    const before = await this.repository.getConfigWritingToProject(params);
    if (!before) return false;
    if (!(await this.repository.clearIngestionProject(params))) return false;

    const after = await this.repository.getConfig(params.organizationId);
    await auditLog(
      {
        ...withoutProjectContext(params.actor),
        resourceType: "gatewayConfig",
        resourceId: params.organizationId,
        action: "update",
        before,
        after,
      },
      this.prisma,
    );
    return true;
  }

  async getConfig(organizationId: string) {
    const config = await this.repository.getConfig(organizationId);
    return (
      config && {
        ...config,
        ingestionMode: getEffectiveGatewayIngestionMode(config.ingestionMode),
      }
    );
  }

  async getSetupStatus(organizationId: string) {
    const { ingestionMode, activeProject } =
      await this.getIngestionState(organizationId);
    return {
      isConfigured: isGatewayIngestionConfigured({
        ingestionMode,
        hasActiveIngestionProject: !!activeProject,
      }),
      /** Whether requests are recorded, which gateway analytics read. */
      isRecording: ingestionMode !== "NONE" && !!activeProject,
    };
  }

  /** The project gateway requests are recorded into, or null when they are not recorded. */
  async getRecordingProjectId(organizationId: string) {
    const { ingestionMode, activeProject } =
      await this.getIngestionState(organizationId);
    return ingestionMode === "NONE" ? null : (activeProject?.id ?? null);
  }

  private async getIngestionState(organizationId: string) {
    const config = await this.getConfig(organizationId);
    const project = config?.defaultIngestionProject;
    return {
      ingestionMode: config?.ingestionMode ?? "USAGE",
      activeProject:
        project && !project.deletedAt && project.orgId === organizationId
          ? project
          : null,
    };
  }

  async updateConfig(params: {
    organizationId: string;
    defaultIngestionProjectId: string | null;
    ingestionMode: GatewayIngestionMode;
    session: OrgAuthedContext["session"];
  }) {
    if (!isGatewayIngestionModeAvailable(params.ingestionMode)) {
      throw new InvalidRequestError(
        "Ingestion mode NONE is not available on Langfuse Cloud",
      );
    }
    if (
      !isGatewayIngestionConfigured({
        ingestionMode: params.ingestionMode,
        hasActiveIngestionProject: !!params.defaultIngestionProjectId,
      })
    ) {
      throw new InvalidRequestError(
        "A default ingestion project is required unless ingestion mode is NONE",
      );
    }

    const before = await this.repository.getConfig(params.organizationId);

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

    const config = await this.prisma.gatewayConfig.upsert({
      where: { organizationId: params.organizationId },
      create: {
        organizationId: params.organizationId,
        defaultIngestionProjectId: params.defaultIngestionProjectId,
        ingestionMode: params.ingestionMode,
      },
      update: {
        defaultIngestionProjectId: params.defaultIngestionProjectId,
        ingestionMode: params.ingestionMode,
      },
    });

    await invalidateGatewayResolveCacheForOrganization(params.organizationId);
    await auditLog(
      {
        session: params.session,
        resourceType: "gatewayConfig",
        resourceId: params.organizationId,
        action: before ? "update" : "create",
        before,
        after: config,
      },
      this.prisma,
    );
    return config;
  }
}
