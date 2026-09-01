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

  /** getOrganization loads an org and its live project ids by id; a miss is a legitimate `NotFound`. */
  async getOrganization(orgId: string): Promise<GetOrganizationResult> {
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
}

/** OrganizationWithProjects is the raw org row plus its live project ids. */
export type OrganizationWithProjects = Organization & {
  projects: { id: string }[];
};

/** GetOrganizationResult is the loaded org, a legitimate miss, or an infra failure. */
export type GetOrganizationResult =
  | (Success & { organization: OrganizationWithProjects })
  | ErrorResult<LangfuseNotFoundError | InternalServerError>;
