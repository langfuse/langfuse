import {
  makeZodVerifiedAPICall,
  makeAPICall,
} from "@/src/__tests__/test-utils";
import { prisma } from "@langfuse/shared/src/db";
import { z } from "zod";
import { randomUUID } from "crypto";
import { Role } from "@langfuse/shared";
import { createMocks } from "node-mocks-http";
import { type NextApiRequest, type NextApiResponse } from "next";
import * as auditLogs from "@/src/features/audit-logs/server";
import { authenticator } from "@/src/features/apiKey/server";
import { type AuthorizationContext } from "@/src/features/auth/policy/types";
import * as sfdc from "@/src/ee/features/sfdc-sync/server";
import {
  handleUpdateMembership,
  handleDeleteMembership,
} from "@/src/ee/features/admin-api/server/memberships";
import {
  createApiKey,
  createBasicAuthHeader,
} from "@langfuse/shared/src/server";
import {
  OrganizationId,
  ProjectId,
  SystemRoleId,
  UserId,
} from "@langfuse/shared/rbac";

// Schema for membership response
const MembershipResponseSchema = z.object({
  userId: z.string(),
  role: z.enum(Role),
  email: z.email(),
  name: z.string().nullable(),
});

// Schema for memberships list response
const MembershipsListSchema = z.object({
  memberships: z.array(MembershipResponseSchema),
});

describe("Memberships APIs", () => {
  // Create test data
  let testOrgId: string;
  let testProjectId: string;
  let testUserId: string;
  let testApiKey: string;
  let testApiSecretKey: string;

  beforeAll(async () => {
    // Create a test organization
    const uniqueOrgName = `Test Org ${randomUUID().substring(0, 8)}`;
    const org = await prisma.organization.create({
      data: { name: uniqueOrgName, cloudConfig: { plan: "Team" } },
    });
    testOrgId = org.id;

    // Create a test project
    const uniqueProjectName = `Test Project ${randomUUID().substring(0, 8)}`;
    const project = await prisma.project.create({
      data: {
        name: uniqueProjectName,
        orgId: testOrgId,
      },
    });
    testProjectId = project.id;

    // Create a test user
    const uniqueUserEmail = `test-user-${randomUUID().substring(0, 8)}@example.com`;
    const user = await prisma.user.create({
      data: {
        email: uniqueUserEmail,
        name: `Test User ${randomUUID().substring(0, 8)}`,
      },
    });
    testUserId = user.id;

    // Create an organization API key
    const apiKey = await createApiKey(prisma, {
      owner: OrganizationId(testOrgId),
      role: SystemRoleId("LEGACY_ORGANIZATION_API_KEY"),
      createdBy: UserId(testUserId),
      name: "Test API Key for Memberships API",
      predefinedKeys: {
        publicKey: `pk-lf-org-${randomUUID().substring(0, 8)}`,
        secretKey: `sk-lf-org-${randomUUID().substring(0, 8)}`,
      },
    });
    testApiKey = apiKey.publicKey;
    testApiSecretKey = apiKey.secretKey;
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.auditLog.deleteMany({ where: { orgId: testOrgId } });
    await prisma.user.delete({
      where: {
        id: testUserId,
      },
    });
    await prisma.organization.delete({
      where: {
        id: testOrgId,
      },
    });
  });

  describe("Project Memberships", () => {
    describe("GET /api/public/projects/[projectId]/memberships", () => {
      it("should get all project memberships with valid API key", async () => {
        // First create an organization membership for the test user
        const orgMembership = await prisma.organizationMembership.create({
          data: {
            userId: testUserId,
            orgId: testOrgId,
            role: Role.MEMBER,
          },
        });

        // Then create a project membership
        await prisma.projectMembership.create({
          data: {
            userId: testUserId,
            projectId: testProjectId,
            role: Role.VIEWER,
            orgMembershipId: orgMembership.id,
          },
        });

        const response = await makeZodVerifiedAPICall(
          MembershipsListSchema,
          "GET",
          `/api/public/projects/${testProjectId}/memberships`,
          undefined,
          createBasicAuthHeader(testApiKey, testApiSecretKey),
          200,
        );

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body.memberships)).toBe(true);
        expect(response.body.memberships.length).toBeGreaterThan(0);
        expect(
          response.body.memberships.some(
            (membership) => membership.userId === testUserId,
          ),
        ).toBe(true);

        const membership = response.body.memberships.find(
          (m) => m.userId === testUserId,
        );
        expect(membership?.role).toBe(Role.VIEWER);
      });

      it("should return 403 when using a non-organization API key", async () => {
        // Create a project API key
        const projectApiKey = await createApiKey(prisma, {
          owner: ProjectId(testProjectId),
          role: SystemRoleId("LEGACY_PROJECT_API_KEY"),
          createdBy: UserId(testUserId),
          name: "Test API Key for Memberships API",
          predefinedKeys: {
            publicKey: `pk-lf-project-${randomUUID().substring(0, 8)}`,
            secretKey: `sk-lf-project-${randomUUID().substring(0, 8)}`,
          },
        });

        const result = await makeAPICall(
          "GET",
          `/api/public/projects/${testProjectId}/memberships`,
          undefined,
          createBasicAuthHeader(
            projectApiKey.publicKey,
            projectApiKey.secretKey,
          ),
        );
        expect(result.status).toBe(403);

        // Clean up
        await prisma.apiKey.delete({
          where: {
            id: projectApiKey.id,
          },
        });
      });
    });

    describe("PUT /api/public/projects/[projectId]/memberships", () => {
      it("should create a new project membership with valid API key", async () => {
        // First ensure the user has an organization membership
        await prisma.organizationMembership.upsert({
          where: {
            orgId_userId: {
              userId: testUserId,
              orgId: testOrgId,
            },
          },
          update: {},
          create: {
            userId: testUserId,
            orgId: testOrgId,
            role: Role.MEMBER,
          },
        });

        // Delete any existing project membership
        await prisma.projectMembership.deleteMany({
          where: {
            userId: testUserId,
            projectId: testProjectId,
          },
        });

        const response = await makeZodVerifiedAPICall(
          MembershipResponseSchema,
          "PUT",
          `/api/public/projects/${testProjectId}/memberships`,
          {
            userId: testUserId,
            role: Role.ADMIN,
          },
          createBasicAuthHeader(testApiKey, testApiSecretKey),
          200,
        );

        expect(response.status).toBe(200);
        expect(response.body.userId).toBe(testUserId);
        expect(response.body.role).toBe(Role.ADMIN);

        // Verify the membership was created in the database
        const membership = await prisma.projectMembership.findUnique({
          where: {
            projectId_userId: {
              userId: testUserId,
              projectId: testProjectId,
            },
          },
        });
        expect(membership?.role).toBe(Role.ADMIN);
      });

      it("should update an existing project membership with valid API key", async () => {
        const response = await makeZodVerifiedAPICall(
          MembershipResponseSchema,
          "PUT",
          `/api/public/projects/${testProjectId}/memberships`,
          {
            userId: testUserId,
            role: Role.OWNER,
          },
          createBasicAuthHeader(testApiKey, testApiSecretKey),
          200,
        );

        expect(response.status).toBe(200);
        expect(response.body.userId).toBe(testUserId);
        expect(response.body.role).toBe(Role.OWNER);

        // Verify the role was updated in the database
        const membership = await prisma.projectMembership.findUnique({
          where: {
            projectId_userId: {
              userId: testUserId,
              projectId: testProjectId,
            },
          },
        });
        expect(membership?.role).toBe(Role.OWNER);
      });

      it("should return 404 when user is not a member of the organization", async () => {
        // Create a new user that is not a member of the organization
        const newUser = await prisma.user.create({
          data: {
            email: `test-user-${randomUUID().substring(0, 8)}@example.com`,
            name: `New Test User`,
          },
        });

        const result = await makeAPICall(
          "PUT",
          `/api/public/projects/${testProjectId}/memberships`,
          {
            userId: newUser.id,
            role: Role.VIEWER,
          },
          createBasicAuthHeader(testApiKey, testApiSecretKey),
        );
        expect(result.status).toBe(404);

        // Clean up
        await prisma.user.delete({
          where: {
            id: newUser.id,
          },
        });
      });
    });

    describe("DELETE /api/public/projects/[projectId]/memberships", () => {
      it("should delete an existing project membership with valid API key", async () => {
        // First ensure the user has an organization membership
        const orgMembership = await prisma.organizationMembership.upsert({
          where: {
            orgId_userId: {
              userId: testUserId,
              orgId: testOrgId,
            },
          },
          update: {},
          create: {
            userId: testUserId,
            orgId: testOrgId,
            role: Role.MEMBER,
          },
        });

        // Create a project membership
        await prisma.projectMembership.upsert({
          where: {
            projectId_userId: {
              userId: testUserId,
              projectId: testProjectId,
            },
          },
          update: {},
          create: {
            userId: testUserId,
            projectId: testProjectId,
            role: Role.VIEWER,
            orgMembershipId: orgMembership.id,
          },
        });

        // Verify membership exists before deletion
        const membershipBefore = await prisma.projectMembership.findUnique({
          where: {
            projectId_userId: {
              userId: testUserId,
              projectId: testProjectId,
            },
          },
        });
        expect(membershipBefore).not.toBeNull();

        // Delete the membership
        const response = await makeAPICall<{ message: string; userId: string }>(
          "DELETE",
          `/api/public/projects/${testProjectId}/memberships`,
          {
            userId: testUserId,
          },
          createBasicAuthHeader(testApiKey, testApiSecretKey),
        );

        expect(response.status).toBe(200);
        expect(response.body.message).toBe(
          "Project membership deleted successfully",
        );
        expect(response.body.userId).toBe(testUserId);

        // Verify the membership was deleted from the database
        const membershipAfter = await prisma.projectMembership.findUnique({
          where: {
            projectId_userId: {
              userId: testUserId,
              projectId: testProjectId,
            },
          },
        });
        expect(membershipAfter).toBeNull();
      });
    });
  });

  describe("Organization Memberships", () => {
    describe("GET /api/public/organizations/memberships", () => {
      it("should get all organization memberships with valid API key", async () => {
        // First ensure the membership exists
        await prisma.organizationMembership.upsert({
          where: {
            orgId_userId: {
              userId: testUserId,
              orgId: testOrgId,
            },
          },
          update: {},
          create: {
            userId: testUserId,
            orgId: testOrgId,
            role: Role.MEMBER,
          },
        });

        const response = await makeZodVerifiedAPICall(
          MembershipsListSchema,
          "GET",
          `/api/public/organizations/memberships`,
          undefined,
          createBasicAuthHeader(testApiKey, testApiSecretKey),
          200,
        );

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body.memberships)).toBe(true);
        expect(response.body.memberships.length).toBeGreaterThan(0);
        expect(
          response.body.memberships.some(
            (membership) => membership.userId === testUserId,
          ),
        ).toBe(true);
      });
    });

    describe("PUT /api/public/organizations/memberships", () => {
      it("should create a new organization membership with valid API key", async () => {
        // First delete any existing membership
        await prisma.organizationMembership.deleteMany({
          where: {
            userId: testUserId,
            orgId: testOrgId,
          },
        });

        const response = await makeZodVerifiedAPICall(
          MembershipResponseSchema,
          "PUT",
          `/api/public/organizations/memberships`,
          {
            userId: testUserId,
            role: Role.ADMIN,
          },
          createBasicAuthHeader(testApiKey, testApiSecretKey),
          200,
        );

        expect(response.status).toBe(200);
        expect(response.body.userId).toBe(testUserId);
        expect(response.body.role).toBe(Role.ADMIN);

        // Verify the membership was created in the database
        const membership = await prisma.organizationMembership.findUnique({
          where: {
            orgId_userId: {
              userId: testUserId,
              orgId: testOrgId,
            },
          },
        });
        expect(membership?.role).toBe(Role.ADMIN);
      });

      it("should update an existing organization membership with valid API key", async () => {
        const response = await makeZodVerifiedAPICall(
          MembershipResponseSchema,
          "PUT",
          `/api/public/organizations/memberships`,
          {
            userId: testUserId,
            role: Role.OWNER,
          },
          createBasicAuthHeader(testApiKey, testApiSecretKey),
          200,
        );

        expect(response.status).toBe(200);
        expect(response.body.userId).toBe(testUserId);
        expect(response.body.role).toBe(Role.OWNER);

        // Verify the role was updated in the database
        const membership = await prisma.organizationMembership.findUnique({
          where: {
            orgId_userId: {
              userId: testUserId,
              orgId: testOrgId,
            },
          },
        });
        expect(membership?.role).toBe(Role.OWNER);
      });

      it("should return 404 when user does not exist", async () => {
        const nonExistentUserId = `user-${randomUUID()}`;

        const result = await makeAPICall(
          "PUT",
          `/api/public/organizations/memberships`,
          {
            userId: nonExistentUserId,
            role: Role.VIEWER,
          },
          createBasicAuthHeader(testApiKey, testApiSecretKey),
        );
        expect(result.status).toBe(404);
      });
    });

    describe("DELETE /api/public/organizations/memberships", () => {
      it("should delete an existing organization membership with valid API key", async () => {
        // First ensure the membership exists
        await prisma.organizationMembership.upsert({
          where: {
            orgId_userId: {
              userId: testUserId,
              orgId: testOrgId,
            },
          },
          update: { role: Role.MEMBER },
          create: {
            userId: testUserId,
            orgId: testOrgId,
            role: Role.MEMBER,
          },
        });

        // Verify membership exists before deletion
        const membershipBefore = await prisma.organizationMembership.findUnique(
          {
            where: {
              orgId_userId: {
                userId: testUserId,
                orgId: testOrgId,
              },
            },
          },
        );
        expect(membershipBefore).not.toBeNull();

        // Delete the membership
        const response = await makeAPICall<{ message: string; userId: string }>(
          "DELETE",
          `/api/public/organizations/memberships`,
          {
            userId: testUserId,
          },
          createBasicAuthHeader(testApiKey, testApiSecretKey),
        );

        expect(response.status).toBe(200);
        expect(response.body.message).toBe("Membership deleted successfully");
        expect(response.body.userId).toBe(testUserId);

        // Verify the membership was deleted from the database
        const membershipAfter = await prisma.organizationMembership.findUnique({
          where: {
            orgId_userId: {
              userId: testUserId,
              orgId: testOrgId,
            },
          },
        });
        expect(membershipAfter).toBeNull();
      });
    });
  });
});

describe("Organization membership safeguards", () => {
  let orgId: string;
  let ownerId: string;
  let memberId: string;
  let apiKeyId: string;
  let adminKeyId: string;
  let ownerContext: AuthorizationContext;
  let adminContext: AuthorizationContext;
  let ownerAuth: string;
  let adminAuth: string;
  let legacyAuth: string;

  beforeEach(async () => {
    const org = await prisma.organization.create({
      data: { name: randomUUID(), cloudConfig: { plan: "Team" } },
    });
    orgId = org.id;
    const [owner, member] = await Promise.all(
      [Role.OWNER, Role.MEMBER].map((role) =>
        prisma.user.create({
          data: {
            email: `${randomUUID()}@example.com`,
            organizationMemberships: { create: { orgId, role } },
          },
        }),
      ),
    );
    ownerId = owner!.id;
    memberId = member!.id;
    const [ownerKey, adminKey] = await Promise.all(
      (["LEGACY_ORGANIZATION_API_KEY", "ADMIN"] as const).map((role) =>
        createApiKey(prisma, {
          owner: OrganizationId(orgId),
          role: SystemRoleId(role),
          createdBy: UserId(ownerId),
        }),
      ),
    );
    apiKeyId = ownerKey!.id;
    adminKeyId = adminKey!.id;
    ownerAuth = createBasicAuthHeader(ownerKey!.publicKey, ownerKey!.secretKey);
    adminAuth = createBasicAuthHeader(adminKey!.publicKey, adminKey!.secretKey);
    legacyAuth = ownerAuth;
    const ownerAuthentication = await authenticator.authenticate({
      headers: { authorization: ownerAuth },
    });
    const adminAuthentication = await authenticator.authenticate({
      headers: { authorization: adminAuth },
    });
    if (!ownerAuthentication.success) throw ownerAuthentication.error;
    if (!adminAuthentication.success) throw adminAuthentication.error;
    ownerContext = ownerAuthentication.context;
    adminContext = adminAuthentication.context;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await prisma.auditLog.deleteMany({ where: { orgId } });
    await prisma.organization.delete({ where: { id: orgId } });
    await prisma.user.deleteMany({
      where: { id: { in: [ownerId, memberId] } },
    });
  });

  const membership = (userId: string) =>
    prisma.organizationMembership.findUnique({
      where: { orgId_userId: { orgId, userId } },
    });
  const logs = () =>
    prisma.auditLog.findMany({
      where: { orgId, resourceType: "orgMembership" },
      orderBy: { createdAt: "asc" },
    });
  const request = (
    method: "PUT" | "DELETE",
    userId: string,
    role?: Role,
    auth = ownerAuth,
  ) =>
    makeAPICall(
      method,
      "/api/public/organizations/memberships",
      { userId, role },
      auth,
    );

  it.each(["PUT", "DELETE"] as const)(
    "rejects last-owner %s without changing state or auditing success",
    async (method) => {
      const before = await membership(ownerId);
      expect((await request(method, ownerId, Role.ADMIN)).status).toBe(403);
      expect(await membership(ownerId)).toEqual(before);
      expect(await logs()).toEqual([]);
    },
  );

  it.each([
    ["PUT", "member", Role.OWNER],
    ["PUT", "owner", Role.ADMIN],
    ["DELETE", "owner", undefined],
  ] as const)("rejects ADMIN %s of %s to %s", async (method, target, role) => {
    if (target === "owner") {
      await prisma.organizationMembership.update({
        where: { orgId_userId: { orgId, userId: memberId } },
        data: { role: Role.OWNER },
      });
    }
    const userId = target === "owner" ? ownerId : memberId;
    const before = await membership(userId);
    expect((await request(method, userId, role, adminAuth)).status).toBe(403);
    expect(await membership(userId)).toEqual(before);
    expect(await logs()).toEqual([]);
  });

  it("lets ADMIN manage ordinary members and remove the last ADMIN", async () => {
    expect((await request("PUT", memberId, Role.ADMIN, adminAuth)).status).toBe(
      200,
    );
    expect(
      (await request("DELETE", memberId, undefined, adminAuth)).status,
    ).toBe(200);
    expect(await membership(memberId)).toBeNull();
    expect((await membership(ownerId))?.role).toBe(Role.OWNER);
  });

  it("combines membership and ownership policy grants across roles", async () => {
    await prisma.organizationMembership.update({
      where: { orgId_userId: { orgId, userId: memberId } },
      data: { role: Role.OWNER },
    });
    const context: AuthorizationContext = {
      ...adminContext,
      policies: (
        [
          ["VIEWER", "organizationMembers:CUD"],
          ["INGEST", "organizationMembers:manageOwnership"],
        ] as const
      ).map(([role, action]) => ({
        id: action,
        roleId: SystemRoleId(role),
        tenantId: OrganizationId(orgId),
        effect: "ALLOW",
        actions: [action],
        resources: [OrganizationId(orgId)],
      })),
    };
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "PUT",
      body: { userId: ownerId, role: Role.MEMBER },
    });
    await handleUpdateMembership(req, res, orgId, adminKeyId, context);
    expect(res.statusCode).toBe(200);
    expect((await membership(ownerId))?.role).toBe(Role.MEMBER);
    expect(await logs()).toHaveLength(1);
  });

  it("denies membership changes without policy grants", async () => {
    const context = { ...ownerContext, policies: [] };
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "DELETE",
      body: { userId: memberId },
    });
    const before = await membership(memberId);
    await expect(
      handleDeleteMembership(req, res, orgId, apiKeyId, context),
    ).rejects.toMatchObject({ httpCode: 403 });
    expect(await membership(memberId)).toEqual(before);
    expect(await logs()).toEqual([]);
  });

  it("rejects a VIEWER key without membership write grants", async () => {
    const key = await createApiKey(prisma, {
      owner: OrganizationId(orgId),
      role: SystemRoleId("VIEWER"),
      createdBy: UserId(ownerId),
    });
    const before = await membership(memberId);
    expect(
      (
        await request(
          "DELETE",
          memberId,
          undefined,
          createBasicAuthHeader(key.publicKey, key.secretKey),
        )
      ).status,
    ).toBe(403);
    expect(await membership(memberId)).toEqual(before);
    expect(await logs()).toEqual([]);
  });

  it("keeps legacy organization keys' owner authority", async () => {
    expect(
      (await request("PUT", memberId, Role.OWNER, legacyAuth)).status,
    ).toBe(200);
    expect(
      (await request("DELETE", ownerId, undefined, legacyAuth)).status,
    ).toBe(200);
    expect(
      (await request("DELETE", memberId, undefined, legacyAuth)).status,
    ).toBe(403);
  });

  it("audits create, update, no-op PUT, and actual deletion with the verified key", async () => {
    await prisma.organizationMembership.deleteMany({
      where: { orgId, userId: memberId },
    });
    expect((await request("PUT", memberId, Role.VIEWER)).status).toBe(200);
    const created = await membership(memberId);
    expect((await request("PUT", memberId, Role.ADMIN)).status).toBe(200);
    const updated = await membership(memberId);
    expect((await request("PUT", ownerId, Role.OWNER)).status).toBe(200);
    expect((await request("DELETE", memberId)).status).toBe(200);
    expect((await request("DELETE", memberId)).status).toBe(200);
    const records = await logs();
    expect(records.map((record) => record.action)).toEqual([
      "create",
      "update",
      "update",
      "delete",
    ]);
    for (const record of records) {
      expect(record).toMatchObject({
        orgId,
        apiKeyId,
        type: "API_KEY",
        userId: null,
        projectId: null,
      });
    }
    const serialized = (value: unknown) => JSON.parse(JSON.stringify(value));
    expect(records[0]).toMatchObject({ resourceId: created!.id, before: null });
    expect(JSON.parse(records[0]!.after!)).toEqual(serialized(created));
    expect(records[1]).toMatchObject({ resourceId: created!.id });
    expect(JSON.parse(records[1]!.before!)).toEqual(serialized(created));
    expect(JSON.parse(records[1]!.after!)).toEqual(serialized(updated));
    expect(records[3]).toMatchObject({ resourceId: created!.id, after: null });
    expect(JSON.parse(records[3]!.before!)).toEqual(serialized(updated));
  });

  it("does not audit invalid requests or missing users", async () => {
    expect((await request("PUT", randomUUID(), Role.MEMBER)).status).toBe(404);
    expect(
      (
        await makeAPICall(
          "PUT",
          "/api/public/organizations/memberships",
          { userId: memberId, role: "INVALID" },
          ownerAuth,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await makeAPICall(
          "DELETE",
          "/api/public/organizations/memberships",
          {},
          ownerAuth,
        )
      ).status,
    ).toBe(400);
    expect(await logs()).toEqual([]);
  });

  it.each(["PUT", "DELETE"] as const)(
    "serializes concurrent owner %s operations",
    async (method) => {
      await prisma.organizationMembership.update({
        where: { orgId_userId: { orgId, userId: memberId } },
        data: { role: Role.OWNER },
      });
      const responses = await Promise.all([
        request(method, ownerId, Role.ADMIN),
        request("DELETE", memberId),
      ]);
      expect(responses.map((response) => response.status).sort()).toEqual([
        200, 403,
      ]);
      expect(
        await prisma.organizationMembership.count({
          where: { orgId, role: Role.OWNER },
        }),
      ).toBe(1);
      expect(await logs()).toHaveLength(1);
    },
  );

  it.each(["create", "update", "delete"] as const)(
    "rolls back %s when audit persistence fails",
    async (operation) => {
      const method = operation === "delete" ? "DELETE" : "PUT";
      if (operation === "create") {
        await prisma.organizationMembership.deleteMany({
          where: { orgId, userId: memberId },
        });
      }
      const before = await membership(memberId);
      vi.spyOn(auditLogs, "auditLog").mockRejectedValueOnce(
        new Error("audit unavailable"),
      );
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method,
        body: { userId: memberId, role: Role.ADMIN },
      });
      const handler =
        method === "PUT" ? handleUpdateMembership : handleDeleteMembership;
      await expect(
        handler(req, res, orgId, apiKeyId, ownerContext),
      ).rejects.toThrow("audit unavailable");
      expect(await membership(memberId)).toEqual(before);
      expect(await logs()).toEqual([]);
    },
  );

  it("retains the committed mutation and audit when SFDC fails", async () => {
    vi.spyOn(sfdc, "getSfdcService").mockImplementation(() => {
      throw new Error("SFDC unavailable");
    });
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "PUT",
      body: { userId: memberId, role: Role.ADMIN },
    });
    await expect(
      handleUpdateMembership(req, res, orgId, apiKeyId, ownerContext),
    ).rejects.toThrow("SFDC unavailable");
    expect((await membership(memberId))?.role).toBe(Role.ADMIN);
    expect(await logs()).toHaveLength(1);
  });
});
