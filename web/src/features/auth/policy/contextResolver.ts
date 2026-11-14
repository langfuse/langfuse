import {
  type ApiKey,
  type ApiKeyScope,
  type Prisma,
  type PrismaClient,
  prisma as defaultPrisma,
} from "@langfuse/shared/src/db";
import {
  CloudConfigSchema,
  type InternalServerError,
  type UnauthorizedError,
} from "@langfuse/shared";
import {
  ApiKeyId,
  OrganizationId,
  ProjectId,
  SystemRoleId,
  UserId,
  systemRoleAccessRights,
} from "@langfuse/shared/rbac";

import {
  getRoleGrantsForPrincipal,
  getRolesForPrincipal,
  type RoleGrant,
} from "@/src/features/rbac/getRolesForPrincipal";
import { getOrganizationPlanServerSide } from "@/src/features/entitlements/server/getPlan";
import {
  OrganizationRepository,
  type GetOrganizationResult,
  type OrganizationWithProjects,
} from "./organizationRepository";
import { UserRepository, type UserRecord } from "./userRepository";
import {
  toPrincipalProject,
  toPrincipalUser,
  toUserFeatureFlags,
} from "./principalAttributes";
import { authorize } from "@/src/features/rbac/authorize";
import { type Flags } from "@/src/features/feature-flags/types";
import { type Policy, type Role } from "@/src/features/rbac/types";
import {
  internalServerError,
  unauthorizedError,
  type AuthorizationContext,
  type BoundResource,
  type ErrorResult,
  type Principal,
  type PrincipalOrganization,
  type Success,
} from "./types";

/** ContextResolver materializes an authenticated credential into its `AuthorizationContext`, loading and enriching the org it implies. */
export class ContextResolver {
  constructor(
    private readonly orgs: OrganizationRepository = new OrganizationRepository(),
    private readonly prisma: PrismaClient = defaultPrisma,
    private readonly users: UserRepository = new UserRepository(),
  ) {}

  /** resolve turns a verified credential or a signed-in session into its context, collapsing a missing org to a 500 invariant break. */
  async resolve(params: UserSessionParams): Promise<ResolvedUser>;
  async resolve(params: ResolveContextParams): Promise<Resolved>;
  async resolve(
    params: ResolveContextParams | UserSessionParams,
  ): Promise<Resolved | ResolvedUser> {
    if ("kind" in params) return this.resolveUser(params);
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- Compatibility until the next major version.
    if (params.authorization === "admin") {
      return { success: true, context: adminContext() };
    }
    const org = await this.getPrincipalOrganization(params.apiKey);
    if (!org.success) return org;
    return {
      success: true,
      context: await materialize(
        params.apiKey,
        // eslint-disable-next-line @typescript-eslint/no-deprecated -- Compatibility until the next major version.
        params.authorization,
        org.organization,
        this.prisma,
      ),
    };
  }

  /** resolveUser materializes a signed-in session into its user context, rejecting a missing subject, a deleted user or a revoked session as a 401. */
  private async resolveUser({
    userId,
    sessionStartedAt,
  }: UserSessionParams): Promise<ResolvedUser> {
    if (!userId) return unauthorizedError();
    const found = await this.users.getUser(userId);
    if (!found.success) return found;
    if (!found.user || !isSessionLive(found.user, sessionStartedAt)) {
      return unauthorizedError();
    }
    const grants = await this.loadGrants(userId);
    if (!grants.success) return grants;
    const orgs = await this.orgs.getOrganizationsByIds(
      grantedOrgIds(grants.grants),
    );
    if (!orgs.success) return orgs;
    return {
      success: true,
      context: materializeUser(found.user, grants.grants, orgs.organizations),
    };
  }

  /** loadGrants loads the user's role grants, collapsing a database failure to a 500. */
  private async loadGrants(
    userId: string,
  ): Promise<
    (Success & { grants: RoleGrant[] }) | ErrorResult<InternalServerError>
  > {
    try {
      return {
        success: true,
        grants: await getRoleGrantsForPrincipal(this.prisma, UserId(userId)),
      };
    } catch (error) {
      return internalServerError(
        `failed to load roles for user ${userId}: ${String(error)}`,
      );
    }
  }

  /** getPrincipalOrganization loads and derives the key's `PrincipalOrganization`, collapsing a null miss to a 500 invariant break. */
  private async getPrincipalOrganization(
    apiKey: ApiKey,
  ): Promise<
    | (Success & { organization: PrincipalOrganization })
    | ErrorResult<InternalServerError>
  > {
    const found = await this.loadOrganization(apiKey);
    if (!found.success) return found;
    if (!found.organization) {
      return internalServerError(
        `verified key ${apiKey.id} resolved to no organization`,
      );
    }
    return {
      success: true,
      organization: toPrincipalOrganization(
        found.organization,
        getCloudConfig(found.organization),
        toUserFeatureFlags([], found.organization, false),
        false,
      ),
    };
  }

  /** loadOrganization loads the key's org by its scope: an org or user key by orgId, a project key by its bound projectId. */
  private async loadOrganization(
    apiKey: ApiKey,
  ): Promise<GetOrganizationResult> {
    if (apiKey.scope === "ORGANIZATION" || apiKey.scope === "USER") {
      if (apiKey.orgId === null) {
        return internalServerError(
          `${apiKey.scope.toLowerCase()} key ${apiKey.id} has no orgId`,
        );
      }
      return this.orgs.getOrganizationByOrgId(apiKey.orgId);
    }
    if (apiKey.projectId === null) {
      return internalServerError(`project key ${apiKey.id} has no projectId`);
    }
    return this.orgs.getOrganizationByProjectId(apiKey.projectId);
  }
}

/** materialize expands the `ApiKey` row and its presentation into the policy sets the credential implies. */
async function materialize(
  apiKey: ApiKey,
  authorization: "publicKey" | "privateKey",
  org: PrincipalOrganization,
  prisma: PrismaClient,
): Promise<AuthorizationContext> {
  const principal: Principal = {
    kind: "apiKey",
    apiKeyId: apiKey.id,
    userId: apiKey.createdByUserId,
    isInAppAgentKey: apiKey.isInAppAgentKey,
    publicKey: apiKey.publicKey,
    scope: apiKey.scope,
    presentation: authorization,
    organizations: [org],
    boundResource: boundResourceFor(apiKey, org),
  };

  const context = {
    principal,
    policies: await getPoliciesForApiKey(prisma, {
      apiKeyId: apiKey.id,
      userId: apiKey.userId,
      scope: apiKey.scope,
    }),
  };
  if (authorization === "publicKey") {
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- Compatibility until the next major version.
    return { principal, policies: publicBearerPolicies(context, apiKey, org) };
  }
  return context;
}

/** materializeUser binds a user's grants into one policy set and lists the orgs it reaches with the live projects it can read. */
function materializeUser(
  user: UserRecord,
  grants: RoleGrant[],
  orgs: OrganizationWithProjects[],
): AuthorizationContext {
  const policies = [toPolicies(grants.map((grant) => grant.role))];
  const principalUser = toPrincipalUser(user, permanentOrgs(grants, orgs));
  const organizations = orgs.map((org) =>
    toPrincipalOrganization(
      readableProjects(org, policies),
      parseCloudConfig(org),
      toUserFeatureFlags(user.featureFlags, org, principalUser.v4BetaEnabled),
      !permanentOrgIds(grants).has(org.id),
    ),
  );
  return {
    principal: { kind: "user", user: principalUser, organizations },
    policies,
  };
}

/** getPoliciesForApiKey loads one policy set per principal an api key acts as: its user's for a user key, then its own. */
export async function getPoliciesForApiKey(
  prisma: Prisma.TransactionClient,
  {
    apiKeyId,
    userId,
    scope,
  }: { apiKeyId: string; userId?: string | null; scope: ApiKeyScope },
): Promise<Policy[][]> {
  const keyPolicies = toPolicies(
    await getRolesForPrincipal(prisma, ApiKeyId(apiKeyId)),
  );
  if (scope !== "USER") return [keyPolicies];
  // An empty user set denies a user key whose user is gone.
  if (!userId) return [[], keyPolicies];
  const userPolicies = toPolicies(
    await getRolesForPrincipal(prisma, UserId(userId)),
  );
  return [userPolicies, keyPolicies];
}

/**
 * publicBearerPolicies narrows a public-key bearer to scores:save on its own project, granted only when the key's stored roles allow it there.
 * @deprecated Public bearer authentication will be removed in the next major version.
 */
function publicBearerPolicies(
  roleContext: AuthorizationContext,
  apiKey: ApiKey,
  org: PrincipalOrganization,
): Policy[][] {
  const tenantId = OrganizationId(org.id);
  const project = ProjectId(apiKey.projectId!);
  if (!authorize(roleContext, tenantId, "scores:save", project).success) {
    return [];
  }
  const resources = [project];
  const roleId = SystemRoleId("SCORES_INGEST");
  return [
    systemRoleAccessRights.SCORES_INGEST.policies.map((policy) => ({
      id: `${roleId}:${policy.resourceKind}`,
      roleId,
      tenantId,
      effect: policy.effect,
      actions: policy.actions,
      resources,
    })),
  ];
}

/** adminContext grants the admin principal OWNER permissions across all tenants. */
function adminContext(): AuthorizationContext {
  const principal: Principal = { kind: "admin", userId: null };
  const roleId = SystemRoleId("OWNER");
  const tenantId = OrganizationId("*");
  const policies: Policy[] = systemRoleAccessRights.OWNER.policies.map(
    (policy) => ({
      id: `${roleId}:${policy.resourceKind}`,
      roleId,
      tenantId,
      effect: policy.effect,
      actions: policy.actions,
      resources: [
        policy.resourceKind === "organization"
          ? OrganizationId("*")
          : ProjectId("*"),
      ],
    }),
  );
  return { principal, policies: [policies] };
}

/** toPolicies flattens a principal's roles into its one policy set. */
function toPolicies(roles: Role[]): Policy[] {
  return roles.flatMap((role) => role.policies);
}

/** boundResourceFor is the target a request resolves against with no header: the key's org, narrowed to its project when the key is project-scoped. */
function boundResourceFor(
  apiKey: ApiKey,
  org: PrincipalOrganization,
): BoundResource {
  if (apiKey.scope !== "PROJECT") return { orgId: org.id };
  return { orgId: org.id, projectId: apiKey.projectId! };
}

/** toPrincipalOrganization derives an org's `PrincipalOrganization` attributes, caps and liveness from its raw row. */
function toPrincipalOrganization(
  org: OrganizationWithProjects,
  cloudConfig: CloudConfigSchema | undefined,
  featureFlagDefaults: Flags,
  supportAccess: boolean,
): PrincipalOrganization {
  return {
    id: org.id,
    createdAt: org.createdAt.toISOString(),
    name: org.name,
    metadata: toMetadata(org.metadata),
    plan: getOrganizationPlanServerSide(cloudConfig),
    rateLimitOverrides: cloudConfig?.rateLimitOverrides ?? [],
    isIngestionSuspended: org.cloudFreeTierUsageThresholdState === "BLOCKED",
    accessAuditLogEnabled: org.accessAuditLogEnabled,
    supportAccess,
    aiFeaturesEnabled: org.aiFeaturesEnabled,
    aiTelemetryEnabled: org.aiTelemetryEnabled,
    featureFlagDefaults,
    cloudConfig,
    projects: org.projects.map(toPrincipalProject),
  };
}

/** getCloudConfig parses an org's raw cloud-config json, or undefined when unset. */
function getCloudConfig(
  org: OrganizationWithProjects,
): CloudConfigSchema | undefined {
  if (!org.cloudConfig) return undefined;
  return CloudConfigSchema.parse(org.cloudConfig);
}

/** parseCloudConfig reads an org's raw cloud-config json, or undefined when unset or malformed. */
function parseCloudConfig(
  org: OrganizationWithProjects,
): CloudConfigSchema | undefined {
  return CloudConfigSchema.safeParse(org.cloudConfig).data;
}

/** toMetadata reads a raw json metadata column as a record, empty when unset. */
function toMetadata(metadata: unknown): Record<string, unknown> {
  return (metadata as Record<string, unknown> | null) ?? {};
}

/** isSessionLive reports whether a session started strictly after the user last revoked their sessions. */
function isSessionLive(user: UserRecord, sessionStartedAt: Date): boolean {
  if (user.sessionsExpiredAt === null) return true;
  return user.sessionsExpiredAt < sessionStartedAt;
}

/** grantedOrgIds lists each org a user's grants reach once. */
function grantedOrgIds(grants: RoleGrant[]): string[] {
  return [...new Set(grants.map((grant) => grant.assignment.orgId))];
}

/** permanentOrgIds is the orgs where the user holds a non-expiring grant. */
function permanentOrgIds(grants: RoleGrant[]): Set<string> {
  return new Set(
    grants
      .filter((grant) => grant.assignment.expiresAt === null)
      .map((grant) => grant.assignment.orgId),
  );
}

/** permanentOrgs keeps the orgs a user reaches through a non-expiring grant. */
function permanentOrgs(
  grants: RoleGrant[],
  orgs: OrganizationWithProjects[],
): OrganizationWithProjects[] {
  const permanent = permanentOrgIds(grants);
  return orgs.filter((org) => permanent.has(org.id));
}

/** readableProjects narrows an org to the live projects the policies let the user read. */
function readableProjects(
  org: OrganizationWithProjects,
  policies: Policy[][],
): OrganizationWithProjects {
  const tenant = OrganizationId(org.id);
  return {
    ...org,
    projects: org.projects.filter(
      (project) =>
        authorize({ policies }, tenant, "project:read", ProjectId(project.id))
          .success,
    ),
  };
}

/** ResolveContextParams is a verified credential: an api key with how it was presented, or the admin key. */
export type ResolveContextParams =
  | {
      /** @deprecated Remove in the next major version when all API-key authentication is private. */
      authorization: "publicKey" | "privateKey";
      apiKey: ApiKey;
    }
  | { authorization: "admin" };

/** UserSessionParams is a signed-in session: the token's subject and when the session started. */
export type UserSessionParams = {
  kind: "user";
  userId: string | undefined;
  sessionStartedAt: Date;
};

/** ResolvedUser is the user's context, a 401 for a session that resolves to no live user, or a 500 on a database failure. */
export type ResolvedUser =
  | (Success & { context: AuthorizationContext })
  | ErrorResult<UnauthorizedError | InternalServerError>;

/** Resolved is the materialized context, or a 500 when a verified key's org is missing. */
export type Resolved =
  | (Success & { context: AuthorizationContext })
  | ErrorResult<InternalServerError>;
