import {
  organizationRoleAccessRights,
  type OrganizationScope,
} from "@langfuse/shared/rbac";
import { type PrismaClient, Role } from "@langfuse/shared/src/db";

type MembersWithScopeParams = {
  organizationId: string;
  scope: OrganizationScope;
  excludeUserId?: string;
};

/** Reads organization members by what their organization role allows them to do. */
export class OrganizationMembersService {
  constructor(private readonly prisma: PrismaClient) {}

  async getOrganizationName(organizationId: string) {
    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { name: true },
    });
    return organization.name;
  }

  /** Counts members with an email address whose role grants `scope`. */
  countMembersWithScope(params: MembersWithScopeParams) {
    return this.prisma.organizationMembership.count({
      where: this.membersWithScopeWhere(params),
    });
  }

  /** Lists members with an email address whose role grants `scope`, oldest membership first. */
  async findMembersWithScope(
    params: MembersWithScopeParams & { limit?: number },
  ) {
    const memberships = await this.prisma.organizationMembership.findMany({
      where: this.membersWithScopeWhere(params),
      orderBy: { createdAt: "asc" },
      take: params.limit,
      select: {
        user: { select: { id: true, name: true, email: true, image: true } },
      },
    });
    return memberships.flatMap(({ user }) =>
      user.email ? [{ ...user, email: user.email }] : [],
    );
  }

  /**
   * Finds the members among `emails` (lowercase, as stored) and whether their
   * role grants `scope`.
   */
  async findMembersByEmail(params: {
    organizationId: string;
    emails: string[];
    scope: OrganizationScope;
  }) {
    if (params.emails.length === 0) return [];
    const memberships = await this.prisma.organizationMembership.findMany({
      where: {
        orgId: params.organizationId,
        user: { email: { in: params.emails } },
      },
      select: {
        role: true,
        user: { select: { id: true, name: true, email: true } },
      },
    });
    return memberships.flatMap(({ role, user }) =>
      user.email
        ? [
            {
              id: user.id,
              name: user.name,
              email: user.email,
              hasScope: organizationRoleAccessRights[role].includes(
                params.scope,
              ),
            },
          ]
        : [],
    );
  }

  private membersWithScopeWhere(params: MembersWithScopeParams) {
    const roles = Object.values(Role).filter((role) =>
      organizationRoleAccessRights[role].includes(params.scope),
    );
    return {
      orgId: params.organizationId,
      role: { in: roles },
      ...(params.excludeUserId
        ? { userId: { not: params.excludeUserId } }
        : {}),
      user: { email: { not: null } },
    };
  }
}
