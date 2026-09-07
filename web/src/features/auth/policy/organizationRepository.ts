import {
  type Organization,
  type PrismaClient,
  prisma as defaultPrisma,
} from "@langfuse/shared/src/db";
import { InternalServerError } from "@langfuse/shared";

import { type ErrorResult, type Success } from "./types";

/** OrganizationRepository reads an org with its live projects, returning a null miss or an infra failure as a value. */
export class OrganizationRepository {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  /** getOrganizationByOrgId loads an org and all its live project ids by org id, carrying a null miss on success. */
  async getOrganizationByOrgId(orgId: string): Promise<GetOrganizationResult> {
    try {
      const organization = await this.prisma.organization.findUnique({
        where: { id: orgId },
        include: {
          projects: { where: { deletedAt: null }, select: { id: true } },
        },
      });
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

  /** getOrganizationByProjectId loads the org owning a live project, carrying only that project id, or a null miss on success for a soft-deleted or unknown project. */
  async getOrganizationByProjectId(
    projectId: string,
  ): Promise<GetOrganizationResult> {
    try {
      const organization = await this.prisma.organization.findFirst({
        where: { projects: { some: { id: projectId, deletedAt: null } } },
      });
      return {
        success: true,
        organization: organization
          ? { ...organization, projects: [{ id: projectId }] }
          : null,
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

/** GetOrganizationResult is the loaded org or a null miss, or an infra failure. */
export type GetOrganizationResult =
  | (Success & { organization: OrganizationWithProjects | null })
  | ErrorResult<InternalServerError>;
