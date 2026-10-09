import {
  Prisma,
  type ApiKey,
  type PrismaClient,
  prisma as defaultPrisma,
} from "@langfuse/shared/src/db";
import { CloudConfigSchema, type InternalServerError } from "@langfuse/shared";
import {
  ApiKeyId,
  OrganizationId,
  ProjectId,
  SystemRoleId,
  systemRoleAccessRights,
} from "@langfuse/shared/rbac";

import { assignRole } from "@langfuse/shared/rbac/server";

import { getRolesForPrincipal } from "@/src/features/rbac/getRolesForPrincipal";
import { getOrganizationPlanServerSide } from "@/src/features/entitlements/server";
import {
  OrganizationRepository,
  type GetOrganizationResult,
  type OrganizationWithProjects,
} from "./organizationRepository";
import { authorize } from "@/src/features/rbac/authorize";
import { type Policy } from "@/src/features/rbac/types";
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
    if (params.authorization === "admin") {
      return { success: true, context: adminContext() };
    }
    const org = await this.getPrincipalOrganization(params.apiKey);
    if (!org.success) return org;
    return {
      success: true,
      context: await materialize(
        params.apiKey,
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

  /** loadOrganization loads the key's org by its scope: an org key by orgId, a project key by its bound projectId. */
  private async loadOrganization(
    apiKey: ApiKey,
  ): Promise<GetOrganizationResult> {
    if (apiKey.scope === "ORGANIZATION") {
      if (apiKey.orgId === null) {
        return internalServerError(`org key ${apiKey.id} has no orgId`);
      }
      return this.orgs.getOrganizationByOrgId(apiKey.orgId);
    }
    if (apiKey.projectId === null) {
      return internalServerError(`project key ${apiKey.id} has no projectId`);
    }
    return this.orgs.getOrganizationByProjectId(apiKey.projectId);
  }
}

/** materialize expands the `ApiKey` row and its presentation into the policies the credential implies. */
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

  let roles = await getRolesForPrincipal(prisma, ApiKeyId(apiKey.id));
  if (roles.length === 0) {
    await backfillApiKeyRoleAssignment(prisma, apiKey, org);
    roles = await getRolesForPrincipal(prisma, ApiKeyId(apiKey.id));
  }
  const context = {
    principal,
    policies: roles.flatMap((role) => role.policies),
  };
  if (authorization === "publicKey") {
    return { principal, policies: publicBearerPolicies(context, apiKey, org) };
  }
  return context;
}

/** backfillApiKeyRoleAssignment restores a verified key's legacy role. */
async function backfillApiKeyRoleAssignment(
  prisma: PrismaClient,
  apiKey: ApiKey,
  org: PrincipalOrganization,
): Promise<void> {
  const isProject = apiKey.scope === "PROJECT";
  try {
    await assignRole(prisma, {
      tenantId: OrganizationId(org.orgId),
      principalId: ApiKeyId(apiKey.id),
      ownerId: isProject
        ? ProjectId(apiKey.projectId!)
        : OrganizationId(apiKey.orgId!),
      roleId: SystemRoleId(
        isProject ? "LEGACY_PROJECT_API_KEY" : "LEGACY_ORGANIZATION_API_KEY",
      ),
      tags: [],
    });
  } catch (error) {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== "P2002"
    ) {
      throw error;
    }
  }
}

/** publicBearerPolicies narrows a public-key bearer to scores:save on its own project, granted only when the key's stored roles allow it there. */
function publicBearerPolicies(
  roleContext: AuthorizationContext,
  apiKey: ApiKey,
  org: PrincipalOrganization,
): Policy[] {
  const tenantId = OrganizationId(org.orgId);
  const project = ProjectId(apiKey.projectId!);
  if (!authorize(roleContext, tenantId, "scores:save", project).success) {
    return [];
  }
  const resources = [project];
  const roleId = SystemRoleId("SCORES_INGEST");
  return systemRoleAccessRights.SCORES_INGEST.policies.map((policy) => ({
    id: `${roleId}:${policy.resourceKind}`,
    roleId,
    tenantId,
    effect: policy.effect,
    actions: policy.actions,
    resources,
  }));
}

/** adminContext is the self-host superuser: an evaluated OWNER on every tenant. It binds the OWNER catalog to the org- and project-kind wildcards under the organization/* tenant, so the PDP grants it exactly what OWNER grants, on every tenant.
 *
 * The organization/* tenant is minted only here; a future custom-role loader must reject a wildcard tenant on a stored role. */
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
  return { principal, policies };
}

/** boundResourceFor is the target a request resolves against with no header: the key's org, narrowed to its project when the key is project-scoped. */
function boundResourceFor(
  apiKey: ApiKey,
  org: PrincipalOrganization,
): BoundResource {
  if (apiKey.scope === "ORGANIZATION") return { orgId: org.orgId };
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
      authorization: "publicKey" | "privateKey";
      apiKey: ApiKey;
    }
  | { authorization: "admin" };

/** Resolved is the materialized context, or a 500 when a verified key's org is missing. */
export type Resolved =
  | (Success & { context: AuthorizationContext })
  | ErrorResult<InternalServerError>;
