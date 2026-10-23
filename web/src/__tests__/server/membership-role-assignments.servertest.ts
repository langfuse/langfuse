import { randomUUID } from "crypto";
import { createMocks } from "node-mocks-http";
import { type NextApiRequest, type NextApiResponse } from "next";
import type { Session } from "next-auth";

import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import { env } from "@/src/env.mjs";
import { createProjectMembershipsOnSignup } from "@/src/features/auth/lib/createProjectMembershipsOnSignup";
import { provisionStarterOrganizationForNewUser } from "@/src/features/onboarding/server/onboardingService";
import {
  createProjectMembership,
  deleteProjectMemberships,
  findOrCreateOrgMembership,
  findOrCreateProjectMembership,
  saveOrgMembership,
  saveProjectMembership,
} from "@langfuse/shared/memberships";
import orgMembershipsRoute from "@/src/pages/api/public/organizations/memberships";
import projectMembershipsRoute from "@/src/pages/api/public/projects/[projectId]/memberships";
import scimUsersRoute from "@/src/pages/api/public/scim/Users";
import scimUserRoute from "@/src/pages/api/public/scim/Users/[id]";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { LangfuseNotFoundError, Role, type Plan } from "@langfuse/shared";
import { OrganizationId, SystemRoleId, UserId } from "@langfuse/shared/rbac";
import { prisma } from "@langfuse/shared/src/db";
import {
  createApiKey,
  createBasicAuthHeader,
} from "@langfuse/shared/src/server";

vi.mock("@/src/env.mjs", async (importOriginal) => {
  const actual = await importOriginal<{ env: typeof env }>();
  return { ...actual, env: { ...actual.env } };
});

type SessionUser = NonNullable<Session["user"]>;
type SessionOrganization = SessionUser["organizations"][number];

const plan: Plan = "cloud:team";

/** callRoute invokes a Next.js API route in-process and fails on non-2xx responses. */
async function callRoute(
  route: (req: NextApiRequest, res: NextApiResponse) => Promise<unknown>,
  method: "POST" | "PUT" | "DELETE",
  authorization: string,
  {
    body,
    query,
  }: { body?: Record<string, unknown>; query?: Record<string, unknown> },
) {
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
    method,
    headers: { authorization },
    query,
    body,
  });
  await route(req, res);
  if (res.statusCode >= 300) {
    throw new Error(`${method} failed: ${res.statusCode} ${res._getData()}`);
  }
  return { status: res.statusCode };
}

/** createUser creates a user with a unique email. */
function createUser() {
  return prisma.user.create({
    data: { email: `user-${randomUUID()}@example.com`, name: "Test User" },
  });
}

/** sorted returns a sorted copy. */
function sorted(values: string[]) {
  return [...values].sort();
}

/** assignment formats a role assignment for comparison. */
function assignment(orgId: string, ownerId: string, roleId: string) {
  return `${orgId} ${ownerId} ${roleId}`;
}

/** org describes an organization-owned role assignment. */
function org(orgId: string, role: Role) {
  return assignment(orgId, `organization/${orgId}`, `system/${role}`);
}

/** proj describes a project-owned role assignment. */
function proj(orgId: string, projectId: string, role: Role) {
  return assignment(orgId, `project/${projectId}`, `system/${role}`);
}

/** rolesOf lists a user's role assignments as sorted tenant/owner/role triples. */
async function rolesOf(userId: string) {
  const assignments = await prisma.roleAssignment.findMany({
    where: { principalId: UserId(userId) },
  });
  return sorted(
    assignments.map((a) => assignment(a.orgId, a.ownerId, a.roleId)),
  );
}

describe("membership role assignments", () => {
  let orgId: string;
  let projectId: string;
  let ownerId: string;

  /** sessionFor builds a session that owns the given organization and its project. */
  function sessionFor(userId: string, ownedOrgId?: string): Session {
    const organizations = ownedOrgId
      ? [
          {
            id: ownedOrgId,
            name: ownedOrgId,
            role: Role.OWNER,
            plan,
            cloudConfig: undefined,
            metadata: {},
            aiFeaturesEnabled: false,
            aiTelemetryEnabled: true,
            projects: [
              {
                id: projectId,
                name: projectId,
                role: Role.OWNER,
                retentionDays: 30,
                deletedAt: null,
                metadata: {},
              },
            ],
          } as unknown as SessionOrganization,
        ]
      : [];
    return {
      expires: "1",
      user: {
        id: userId,
        email: `${userId}@example.com`,
        name: userId,
        canCreateOrganizations: true,
        organizations,
        featureFlags: testFeatureFlags(),
        admin: false,
      } as SessionUser,
      environment: {
        enableExperimentalFeatures: false,
        selfHostedInstancePlan: plan,
      },
    };
  }

  /** callerFor calls tRPC as a user who may own an organization. */
  function callerFor(userId: string, ownedOrgId?: string) {
    const ctx = createInnerTRPCContext({
      session: sessionFor(userId, ownedOrgId),
      headers: {},
    });
    return appRouter.createCaller({ ...ctx, prisma });
  }

  /** ownerCaller calls tRPC as the organization owner. */
  function ownerCaller() {
    return callerFor(ownerId, orgId);
  }

  /** orgApiKeyHeader mints an organization API key and returns its basic auth header. */
  async function orgApiKeyHeader() {
    const key = await createApiKey(prisma, {
      tenant: OrganizationId(orgId),
      scope: OrganizationId(orgId),
      role: SystemRoleId("LEGACY_ORGANIZATION_API_KEY"),
      createdBy: UserId(ownerId),
    });
    return createBasicAuthHeader(key.publicKey, key.secretKey);
  }

  /** callOrgMemberships invokes the public organization memberships route. */
  async function callOrgMemberships(
    method: "PUT" | "DELETE",
    authorization: string,
    body: Record<string, unknown>,
  ) {
    return callRoute(orgMembershipsRoute, method, authorization, { body });
  }

  /** callProjectMemberships invokes the public project memberships route. */
  async function callProjectMemberships(
    method: "PUT" | "DELETE",
    authorization: string,
    body: Record<string, unknown>,
  ) {
    return callRoute(projectMembershipsRoute, method, authorization, {
      body,
      query: { projectId },
    });
  }

  /** callScim invokes a SCIM users route. */
  async function callScim(
    route: typeof scimUsersRoute,
    method: "POST" | "PUT" | "DELETE",
    authorization: string,
    { userId, body }: { userId?: string; body?: Record<string, unknown> },
  ) {
    return callRoute(route, method, authorization, {
      body,
      query: { id: userId },
    });
  }

  /** orgMembershipId looks up the user's membership in the test organization. */
  async function orgMembershipId(userId: string) {
    const membership = await prisma.organizationMembership.findUniqueOrThrow({
      where: { orgId_userId: { orgId, userId } },
    });
    return membership.id;
  }

  beforeEach(async () => {
    const org = await prisma.organization.create({
      data: { name: randomUUID(), cloudConfig: { plan: "Team" } },
    });
    const project = await prisma.project.create({
      data: { name: randomUUID(), orgId: org.id },
    });
    const owner = await createUser();
    await prisma.organizationMembership.create({
      data: { orgId: org.id, userId: owner.id, role: Role.OWNER },
    });
    orgId = org.id;
    projectId = project.id;
    ownerId = owner.id;
  });

  describe("membership repositories", () => {
    it("findOrCreateOrgMembership creates a missing membership", async () => {
      const user = await createUser();

      const membership = await findOrCreateOrgMembership(prisma, {
        orgId,
        userId: user.id,
        role: Role.VIEWER,
      });

      expect(membership.role).toBe(Role.VIEWER);
      expect(await rolesOf(user.id)).toEqual([org(orgId, "VIEWER")]);
    });

    it("findOrCreateOrgMembership keeps an existing role", async () => {
      const user = await createUser();
      await saveOrgMembership(prisma, {
        orgId,
        userId: user.id,
        role: Role.ADMIN,
      });

      const membership = await findOrCreateOrgMembership(prisma, {
        orgId,
        userId: user.id,
        role: Role.VIEWER,
      });

      expect(membership.role).toBe(Role.ADMIN);
      expect(await rolesOf(user.id)).toEqual([org(orgId, "ADMIN")]);
    });

    it("findOrCreateProjectMembership creates a missing membership", async () => {
      const user = await createUser();
      const orgMembership = await saveOrgMembership(prisma, {
        orgId,
        userId: user.id,
        role: Role.VIEWER,
      });

      const membership = await findOrCreateProjectMembership(prisma, {
        orgId,
        orgMembershipId: orgMembership.id,
        projectId,
        userId: user.id,
        role: Role.MEMBER,
      });

      expect(membership.role).toBe(Role.MEMBER);
      expect(await rolesOf(user.id)).toEqual(
        sorted([org(orgId, "VIEWER"), proj(orgId, projectId, "MEMBER")]),
      );
    });

    it("findOrCreateProjectMembership keeps an existing role", async () => {
      const user = await createUser();
      const orgMembership = await saveOrgMembership(prisma, {
        orgId,
        userId: user.id,
        role: Role.VIEWER,
      });
      const input = {
        orgId,
        orgMembershipId: orgMembership.id,
        projectId,
        userId: user.id,
      };
      await saveProjectMembership(prisma, { ...input, role: Role.ADMIN });

      const membership = await findOrCreateProjectMembership(prisma, {
        ...input,
        role: Role.MEMBER,
      });

      expect(membership.role).toBe(Role.ADMIN);
      expect(await rolesOf(user.id)).toEqual(
        sorted([org(orgId, "VIEWER"), proj(orgId, projectId, "ADMIN")]),
      );
    });

    it.each([
      ["saveProjectMembership", saveProjectMembership],
      ["createProjectMembership", createProjectMembership],
      ["findOrCreateProjectMembership", findOrCreateProjectMembership],
    ])(
      "%s rejects a project outside the organization",
      async (_, writeProjectMembership) => {
        const user = await createUser();
        const otherOrg = await prisma.organization.create({
          data: { name: randomUUID() },
        });
        const otherMembership = await prisma.organizationMembership.create({
          data: { orgId: otherOrg.id, userId: user.id, role: Role.VIEWER },
        });

        await expect(
          writeProjectMembership(prisma, {
            orgId: otherOrg.id,
            orgMembershipId: otherMembership.id,
            projectId,
            userId: user.id,
            role: Role.ADMIN,
          }),
        ).rejects.toBeInstanceOf(LangfuseNotFoundError);
        expect(
          await prisma.projectMembership.count({ where: { userId: user.id } }),
        ).toBe(0);
        expect(await rolesOf(user.id)).toEqual([]);
      },
    );

    it("deleteProjectMemberships removes the project's memberships and roles", async () => {
      const [first, second] = await Promise.all([createUser(), createUser()]);
      const otherProject = await prisma.project.create({
        data: { name: randomUUID(), orgId },
      });
      for (const user of [first, second]) {
        const orgMembership = await saveOrgMembership(prisma, {
          orgId,
          userId: user.id,
          role: Role.VIEWER,
        });
        await saveProjectMembership(prisma, {
          orgId,
          orgMembershipId: orgMembership.id,
          projectId,
          userId: user.id,
          role: Role.MEMBER,
        });
        await saveProjectMembership(prisma, {
          orgId,
          orgMembershipId: orgMembership.id,
          projectId: otherProject.id,
          userId: user.id,
          role: Role.ADMIN,
        });
      }

      await deleteProjectMemberships(prisma, { projectId });

      expect(
        await prisma.projectMembership.count({ where: { projectId } }),
      ).toBe(0);
      for (const user of [first, second]) {
        expect(await rolesOf(user.id)).toEqual(
          sorted([org(orgId, "VIEWER"), proj(orgId, otherProject.id, "ADMIN")]),
        );
      }
    });
  });

  describe("tRPC", () => {
    it("members.create assigns the org and project roles", async () => {
      const user = await createUser();

      await ownerCaller().members.create({
        orgId,
        email: user.email!,
        orgRole: Role.MEMBER,
        projectId,
        projectRole: Role.VIEWER,
      });

      expect(await rolesOf(user.id)).toEqual(
        sorted([org(orgId, "MEMBER"), proj(orgId, projectId, "VIEWER")]),
      );
    });

    it("members.create assigns a project role to an existing org member", async () => {
      const user = await createUser();
      await ownerCaller().members.create({
        orgId,
        email: user.email!,
        orgRole: Role.NONE,
      });

      await ownerCaller().members.create({
        orgId,
        email: user.email!,
        orgRole: Role.NONE,
        projectId,
        projectRole: Role.ADMIN,
      });

      expect(await rolesOf(user.id)).toEqual(
        sorted([org(orgId, "NONE"), proj(orgId, projectId, "ADMIN")]),
      );
    });

    it("members.updateOrgMembership replaces the org role", async () => {
      const user = await createUser();
      await ownerCaller().members.create({
        orgId,
        email: user.email!,
        orgRole: Role.MEMBER,
      });

      await ownerCaller().members.updateOrgMembership({
        orgId,
        orgMembershipId: await orgMembershipId(user.id),
        role: Role.ADMIN,
      });

      expect(await rolesOf(user.id)).toEqual([org(orgId, "ADMIN")]);
    });

    it("members.updateProjectRole sets and clears the project role", async () => {
      const user = await createUser();
      await ownerCaller().members.create({
        orgId,
        email: user.email!,
        orgRole: Role.VIEWER,
      });
      const input = {
        orgId,
        orgMembershipId: await orgMembershipId(user.id),
        userId: user.id,
        projectId,
      };

      await ownerCaller().members.updateProjectRole({
        ...input,
        projectRole: Role.MEMBER,
      });
      expect(await rolesOf(user.id)).toEqual(
        sorted([org(orgId, "VIEWER"), proj(orgId, projectId, "MEMBER")]),
      );

      await ownerCaller().members.updateProjectRole({
        ...input,
        projectRole: Role.ADMIN,
      });
      expect(await rolesOf(user.id)).toEqual(
        sorted([org(orgId, "VIEWER"), proj(orgId, projectId, "ADMIN")]),
      );

      await ownerCaller().members.updateProjectRole({
        ...input,
        projectRole: null,
      });
      expect(await rolesOf(user.id)).toEqual([org(orgId, "VIEWER")]);
    });

    it("members.deleteMembership removes only that organization's roles", async () => {
      const user = await createUser();
      await ownerCaller().members.create({
        orgId,
        email: user.email!,
        orgRole: Role.MEMBER,
        projectId,
        projectRole: Role.VIEWER,
      });
      const otherOrg = await prisma.organization.create({
        data: { name: randomUUID() },
      });
      await prisma.organizationMembership.create({
        data: { orgId: otherOrg.id, userId: ownerId, role: Role.OWNER },
      });
      await callerFor(ownerId, otherOrg.id).members.create({
        orgId: otherOrg.id,
        email: user.email!,
        orgRole: Role.VIEWER,
      });

      await ownerCaller().members.deleteMembership({
        orgId,
        orgMembershipId: await orgMembershipId(user.id),
      });

      expect(await rolesOf(user.id)).toEqual([org(otherOrg.id, "VIEWER")]);
    });

    it("organizations.create assigns the creator OWNER", async () => {
      const creator = await createUser();

      const created = await callerFor(creator.id).organizations.create({
        name: `org-${randomUUID().substring(0, 8)}`,
        aiFeaturesEnabled: false,
      });

      expect(await rolesOf(creator.id)).toEqual([org(created.id, "OWNER")]);
    });
  });

  describe("public organization memberships API", () => {
    it("PUT assigns and replaces the org role, DELETE removes it", async () => {
      const user = await createUser();
      const authorization = await orgApiKeyHeader();

      await callOrgMemberships("PUT", authorization, {
        userId: user.id,
        role: Role.MEMBER,
      });
      expect(await rolesOf(user.id)).toEqual([org(orgId, "MEMBER")]);

      await callOrgMemberships("PUT", authorization, {
        userId: user.id,
        role: Role.VIEWER,
      });
      expect(await rolesOf(user.id)).toEqual([org(orgId, "VIEWER")]);

      await prisma.projectMembership.create({
        data: {
          projectId,
          userId: user.id,
          role: Role.ADMIN,
          orgMembershipId: await orgMembershipId(user.id),
        },
      });
      await callOrgMemberships("DELETE", authorization, { userId: user.id });
      expect(await rolesOf(user.id)).toEqual([]);
    });
  });

  describe("public project memberships API", () => {
    it("PUT assigns and replaces the project role, DELETE removes it", async () => {
      const user = await createUser();
      const authorization = await orgApiKeyHeader();
      await callOrgMemberships("PUT", authorization, {
        userId: user.id,
        role: Role.NONE,
      });

      await callProjectMemberships("PUT", authorization, {
        userId: user.id,
        role: Role.MEMBER,
      });
      expect(await rolesOf(user.id)).toEqual(
        sorted([org(orgId, "NONE"), proj(orgId, projectId, "MEMBER")]),
      );

      await callProjectMemberships("PUT", authorization, {
        userId: user.id,
        role: Role.NONE,
      });
      expect(await rolesOf(user.id)).toEqual(
        sorted([org(orgId, "NONE"), proj(orgId, projectId, "NONE")]),
      );

      await callProjectMemberships("DELETE", authorization, {
        userId: user.id,
      });
      expect(await rolesOf(user.id)).toEqual([org(orgId, "NONE")]);
    });
  });

  describe("SCIM", () => {
    it("POST /Users assigns the org role", async () => {
      const authorization = await orgApiKeyHeader();
      const email = `scim-${randomUUID()}@example.com`;

      const response = await callScim(scimUsersRoute, "POST", authorization, {
        body: {
          schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
          userName: email,
          name: { formatted: "SCIM User" },
          roles: ["MEMBER"],
        },
      });
      const user = await prisma.user.findUniqueOrThrow({ where: { email } });

      expect(response.status).toBe(201);
      expect(await rolesOf(user.id)).toEqual([org(orgId, "MEMBER")]);
    });

    it("PUT /Users/{id} creates, replaces and removes the org role", async () => {
      const authorization = await orgApiKeyHeader();
      const user = await createUser();
      const put = (body: Record<string, unknown>) =>
        callScim(scimUserRoute, "PUT", authorization, {
          userId: user.id,
          body: {
            schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
            id: user.id,
            userName: user.email,
            ...body,
          },
        });

      await put({ active: true });
      expect(await rolesOf(user.id)).toEqual([org(orgId, "NONE")]);

      await put({ active: true, roles: ["ADMIN"] });
      expect(await rolesOf(user.id)).toEqual([org(orgId, "ADMIN")]);

      await put({ active: false });
      expect(await rolesOf(user.id)).toEqual([]);
    });

    it("DELETE /Users/{id} removes the org role", async () => {
      const authorization = await orgApiKeyHeader();
      const user = await createUser();
      await callScim(scimUserRoute, "PUT", authorization, {
        userId: user.id,
        body: {
          schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
          id: user.id,
          userName: user.email,
          active: true,
          roles: ["VIEWER"],
        },
      });
      expect(await rolesOf(user.id)).toEqual([org(orgId, "VIEWER")]);

      await callScim(scimUserRoute, "DELETE", authorization, {
        userId: user.id,
      });

      expect(await rolesOf(user.id)).toEqual([]);
    });
  });

  describe("signup", () => {
    const overriddenEnvKeys = [
      "NEXT_PUBLIC_DEMO_ORG_ID",
      "NEXT_PUBLIC_DEMO_PROJECT_ID",
      "LANGFUSE_DEFAULT_ORG_ID",
      "LANGFUSE_DEFAULT_ORG_ROLE",
      "LANGFUSE_DEFAULT_PROJECT_ID",
    ] as const;
    const savedEnv: Record<string, unknown> = {};
    const mutableEnv = env as Record<string, unknown>;

    beforeEach(() => {
      for (const key of overriddenEnvKeys) {
        savedEnv[key] = mutableEnv[key];
        mutableEnv[key] = undefined;
      }
    });

    afterEach(() => {
      Object.assign(mutableEnv, savedEnv);
    });

    it("assigns the default organization role", async () => {
      mutableEnv.LANGFUSE_DEFAULT_ORG_ID = [orgId];
      mutableEnv.LANGFUSE_DEFAULT_ORG_ROLE = Role.MEMBER;
      const user = await createUser();

      await createProjectMembershipsOnSignup(user);

      expect(await rolesOf(user.id)).toEqual([org(orgId, "MEMBER")]);
    });

    it("assigns the roles of accepted invitations", async () => {
      const user = await createUser();
      await prisma.membershipInvitation.create({
        data: {
          email: user.email!,
          orgId,
          orgRole: Role.VIEWER,
          projectId,
          projectRole: Role.ADMIN,
        },
      });

      await createProjectMembershipsOnSignup(user);

      expect(await rolesOf(user.id)).toEqual(
        sorted([org(orgId, "VIEWER"), proj(orgId, projectId, "ADMIN")]),
      );
    });

    it("joins the invited org when the invited project moved to another org", async () => {
      const user = await createUser();
      const otherOrg = await prisma.organization.create({
        data: { name: randomUUID() },
      });
      await prisma.membershipInvitation.create({
        data: {
          email: user.email!,
          orgId,
          orgRole: Role.VIEWER,
          projectId,
          projectRole: Role.ADMIN,
        },
      });
      await prisma.project.update({
        where: { id: projectId },
        data: { orgId: otherOrg.id },
      });

      await createProjectMembershipsOnSignup(user);

      expect(await rolesOf(user.id)).toEqual([org(orgId, "VIEWER")]);
      expect(
        await prisma.membershipInvitation.count({
          where: { email: user.email! },
        }),
      ).toBe(0);
    });

    it("assigns OWNER on a provisioned starter organization", async () => {
      const user = await createUser();

      const created = await provisionStarterOrganizationForNewUser({
        prisma,
        userId: user.id,
      });

      expect(await rolesOf(user.id)).toEqual([
        org(created!.organization.id, "OWNER"),
      ]);
    });
  });
});
