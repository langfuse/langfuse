import {
  type Organization,
  type Prisma,
  type PrismaClient,
  type Project,
  prisma as defaultPrisma,
} from "@langfuse/shared/src/db";
import { type InternalServerError } from "@langfuse/shared";

import { internalServerError, type ErrorResult, type Success } from "./types";

/** projectSelect is the live-project columns a principal carries. */
const projectSelect = {
  id: true,
  name: true,
  retentionDays: true,
  hasTraces: true,
  metadata: true,
  createdAt: true,
} satisfies Prisma.ProjectSelect;

/** OrganizationRepository reads an org with its live projects, returning a null miss or an infra failure as a value. */
export class OrganizationRepository {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  /** getOrganizationByOrgId loads an org and all its live projects by org id, carrying a null miss on success. */
  async getOrganizationByOrgId(orgId: string): Promise<GetOrganizationResult> {
    try {
      const organization = await this.prisma.organization.findUnique({
        where: { id: orgId },
        include: {
          projects: {
            where: { deletedAt: null },
            select: projectSelect,
            orderBy: { createdAt: "desc" },
          },
        },
      });
      return { success: true, organization };
    } catch (error) {
      return internalServerError(
        `failed to load org ${orgId}: ${String(error)}`,
      );
    }
  }

  /** getOrganizationByProjectId loads the org owning a live project, carrying only that project, or a null miss on success for a soft-deleted or unknown project. */
  async getOrganizationByProjectId(
    projectId: string,
  ): Promise<GetOrganizationResult> {
    try {
      const organization = await this.prisma.organization.findFirst({
        where: { projects: { some: { id: projectId, deletedAt: null } } },
        include: {
          projects: {
            where: { id: projectId, deletedAt: null },
            select: projectSelect,
          },
        },
      });
      return { success: true, organization };
    } catch (error) {
      return internalServerError(
        `failed to load org for project ${projectId}: ${String(error)}`,
      );
    }
  }

  /** getOrganizationsByIds loads the orgs with orgIds and their live projects, newest project first. */
  async getOrganizationsByIds(
    orgIds: string[],
  ): Promise<GetOrganizationsResult> {
    try {
      const organizations = await this.prisma.organization.findMany({
        where: { id: { in: orgIds } },
        include: {
          projects: {
            where: { deletedAt: null },
            select: projectSelect,
            orderBy: { createdAt: "desc" },
          },
        },
      });
      return { success: true, organizations };
    } catch (error) {
      return internalServerError(`failed to load orgs: ${String(error)}`);
    }
  }
}

/** OrganizationProject is a live project row as a principal carries it. */
export type OrganizationProject = Pick<
  Project,
  "id" | "name" | "retentionDays" | "hasTraces" | "metadata" | "createdAt"
>;

/** OrganizationWithProjects is the raw org row plus its live projects. */
export type OrganizationWithProjects = Organization & {
  projects: OrganizationProject[];
};

/** GetOrganizationResult is the loaded org or a null miss, or an infra failure. */
export type GetOrganizationResult =
  | (Success & { organization: OrganizationWithProjects | null })
  | ErrorResult<InternalServerError>;

/** GetOrganizationsResult is the loaded orgs, or an infra failure. */
type GetOrganizationsResult =
  | (Success & { organizations: OrganizationWithProjects[] })
  | ErrorResult<InternalServerError>;
