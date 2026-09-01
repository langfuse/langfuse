import {
  type Organization,
  type PrismaClient,
  prisma as defaultPrisma,
} from "@langfuse/shared/src/db";
import { InternalServerError, LangfuseNotFoundError } from "@langfuse/shared";

import { type ErrorResult, type Success } from "./types";

/** OrganizationRepository reads an org with its live projects, returning a miss or infra failure as a value. */
export class OrganizationRepository {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  /** getOrganizationByOrgId loads an org and all its live project ids by org id; a miss is a legitimate `NotFound`. */
  async getOrganizationByOrgId(orgId: string): Promise<GetOrganizationResult> {
    try {
      const organization = await this.prisma.organization.findUnique({
        where: { id: orgId },
        include: {
          projects: { where: { deletedAt: null }, select: { id: true } },
        },
      });
      if (!organization) {
        return {
          success: false,
          error: new LangfuseNotFoundError(`org ${orgId} not found`),
        };
      }
      return { success: true, organization };
    } catch (error) {
      return {
        success: false,
        error: new InternalServerError(
          `failed to load org ${orgId}: ${String(error)}`,
        ),
      };
    }
  }

  /** getOrganizationByProjectId loads the org owning a live project, carrying only that project id; a soft-deleted or unknown project is a legitimate `NotFound`. */
  async getOrganizationByProjectId(
    projectId: string,
  ): Promise<GetOrganizationResult> {
    try {
      const organization = await this.prisma.organization.findFirst({
        where: { projects: { some: { id: projectId, deletedAt: null } } },
      });
      if (!organization) {
        return {
          success: false,
          error: new LangfuseNotFoundError(
            `no live project ${projectId} found`,
          ),
        };
      }
      return {
        success: true,
        organization: { ...organization, projects: [{ id: projectId }] },
      };
    } catch (error) {
      return {
        success: false,
        error: new InternalServerError(
          `failed to load org for project ${projectId}: ${String(error)}`,
        ),
      };
    }
  }
}

/** OrganizationWithProjects is the raw org row plus its live project ids. */
export type OrganizationWithProjects = Organization & {
  projects: { id: string }[];
};

/** GetOrganizationResult is the loaded org, a legitimate miss, or an infra failure. */
export type GetOrganizationResult =
  | (Success & { organization: OrganizationWithProjects })
  | ErrorResult<LangfuseNotFoundError | InternalServerError>;
