import {
  type ApiKey,
  type ApiKeyScope,
  type Prisma,
  type PrismaClient,
  prisma as defaultPrisma,
} from "@langfuse/shared/src/db";
import { CloudConfigSchema, type InternalServerError } from "@langfuse/shared";
import {
  ApiKeyId,
  OrganizationId,
  ProjectId,
  SystemRoleId,
  UserId,
  systemRoleAccessRights,
} from "@langfuse/shared/rbac";

import { isSandboxPublicKey } from "@langfuse/shared/in-app-agent";
import { isSandboxKeyAction } from "@langfuse/shared/in-app-agent/server/sandboxKey";

import { getRolesForPrincipal } from "@/src/features/rbac/getRolesForPrincipal";
import { getOrganizationPlanServerSide } from "@/src/features/entitlements/server/getPlan";
import {
  OrganizationRepository,
  type GetOrganizationResult,
  type OrganizationWithProjects,
} from "./organizationRepository";
import { authorize } from "@/src/features/rbac/authorize";
import { type Policy, type Role } from "@/src/features/rbac/types";
import {
  internalServerError,
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
  ) {}

  /** resolve turns a verified credential into its context, collapsing a missing org to a 500 invariant break. */
  async resolve(params: ResolveContextParams): Promise<Resolved> {
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
      organization: toPrincipalOrganization(found.organization),
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

  if (isSandboxPublicKey(apiKey.publicKey)) {
    return {
      principal,
      policies: await sandboxKeyPolicies(prisma, apiKey, authorization),
    };
  }
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

/**
 * sandboxKeyPolicies caps an in-app agent sandbox key at the sandbox scope.
 * Its stored role is the bound user's project role at mint, so the result is
 * that role intersected with the sandbox scope. A key that is not a
 * user-bound project key, is presented as a public key, or lost its role
 * assignment gets no policies; there is no legacy backfill.
 */
async function sandboxKeyPolicies(
  prisma: PrismaClient,
  apiKey: ApiKey,
  authorization: "publicKey" | "privateKey",
): Promise<Policy[][]> {
  if (
    authorization !== "privateKey" ||
    apiKey.scope !== "PROJECT" ||
    apiKey.userId === null ||
    apiKey.userId !== apiKey.createdByUserId
  ) {
    return [];
  }
  const policies = toPolicies(
    await getRolesForPrincipal(prisma, ApiKeyId(apiKey.id)),
  )
    .map((policy) =>
      policy.effect === "DENY"
        ? policy
        : { ...policy, actions: policy.actions.filter(isSandboxKeyAction) },
    )
    .filter((policy) => policy.actions.length > 0);
  return policies.length > 0 ? [policies] : [];
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
  const tenantId = OrganizationId(org.orgId);
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
  if (apiKey.scope !== "PROJECT") return { orgId: org.orgId };
  return { orgId: org.orgId, projectId: apiKey.projectId! };
}

/** toPrincipalOrganization derives an org's `PrincipalOrganization` caps and liveness from its raw row. */
function toPrincipalOrganization(
  org: OrganizationWithProjects,
): PrincipalOrganization {
  const cloudConfig = getCloudConfig(org);
  return {
    orgId: org.id,
    organizationCreatedAt: org.createdAt.toISOString(),
    plan: getOrganizationPlanServerSide(cloudConfig),
    rateLimitOverrides: cloudConfig?.rateLimitOverrides ?? [],
    projectIds: org.projects.map((p) => p.id),
    isIngestionSuspended: org.cloudFreeTierUsageThresholdState === "BLOCKED",
    accessAuditLogEnabled: org.accessAuditLogEnabled,
  };
}

/** getCloudConfig parses an org's raw cloud-config json, or undefined when unset. */
function getCloudConfig(
  org: OrganizationWithProjects,
): CloudConfigSchema | undefined {
  return org.cloudConfig ? CloudConfigSchema.parse(org.cloudConfig) : undefined;
}

/** ResolveContextParams is a verified credential: an api key with how it was presented, or the admin key. */
export type ResolveContextParams =
  | {
      /** @deprecated Remove in the next major version when all API-key authentication is private. */
      authorization: "publicKey" | "privateKey";
      apiKey: ApiKey;
    }
  | { authorization: "admin" };

/** Resolved is the materialized context, or a 500 when a verified key's org is missing. */
export type Resolved =
  | (Success & { context: AuthorizationContext })
  | ErrorResult<InternalServerError>;
