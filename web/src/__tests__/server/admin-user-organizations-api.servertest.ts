import {
  makeZodVerifiedAPICall,
  makeAPICall,
} from "@/src/__tests__/test-utils";
import { prisma } from "@langfuse/shared/src/db";
import { Role } from "@langfuse/shared";
import { z } from "zod";
import { randomUUID } from "crypto";

// Schema for user organizations response
const UserOrganizationsResponseSchema = z.object({
  userId: z.string(),
  email: z.email(),
  name: z.string().nullable(),
  organizations: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      createdAt: z.iso.datetime(),
      role: z.enum(Role),
      metadata: z.record(z.string(), z.unknown()),
    }),
  ),
});

describe("Admin User Organizations API", () => {
  const ADMIN_API_KEY = process.env.ADMIN_API_KEY;

  let testOrg1Id: string;
  let testOrg2Id: string;
  let testUserId: string;
  let testUserEmail: string;
  let userWithoutOrgsId: string;
  let userWithoutOrgsEmail: string;

  const userOrganizationsUrl = (email: string) =>
    `/api/admin/users/${encodeURIComponent(email)}/organizations`;

  beforeAll(async () => {
    // Create two test organizations
    const org1 = await prisma.organization.create({
      data: {
        name: `Test Org 1 ${randomUUID().substring(0, 8)}`,
        metadata: { tier: "testing" },
      },
    });
    testOrg1Id = org1.id;

    const org2 = await prisma.organization.create({
      data: { name: `Test Org 2 ${randomUUID().substring(0, 8)}` },
    });
    testOrg2Id = org2.id;

    // Create a user with memberships in both organizations
    testUserEmail = `test-user-${randomUUID().substring(0, 8)}@example.com`;
    const user = await prisma.user.create({
      data: { email: testUserEmail, name: "Test User" },
    });
    testUserId = user.id;

    await prisma.organizationMembership.create({
      data: { orgId: testOrg1Id, userId: testUserId, role: Role.OWNER },
    });
    await prisma.organizationMembership.create({
      data: { orgId: testOrg2Id, userId: testUserId, role: Role.VIEWER },
    });

    // Create a user without any organization memberships
    userWithoutOrgsEmail = `test-user-no-orgs-${randomUUID().substring(0, 8)}@example.com`;
    const userWithoutOrgs = await prisma.user.create({
      data: { email: userWithoutOrgsEmail, name: "No Orgs User" },
    });
    userWithoutOrgsId = userWithoutOrgs.id;
  });

  afterAll(async () => {
    await prisma.organizationMembership.deleteMany({
      where: { userId: { in: [testUserId, userWithoutOrgsId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [testUserId, userWithoutOrgsId] } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: [testOrg1Id, testOrg2Id] } },
    });
  });

  describe("GET /api/admin/users/[email]/organizations", () => {
    it("should return all organizations of a user with their roles", async () => {
      const response = await makeZodVerifiedAPICall(
        UserOrganizationsResponseSchema,
        "GET",
        userOrganizationsUrl(testUserEmail),
        undefined,
        `Bearer ${ADMIN_API_KEY}`,
        200,
      );

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        userId: testUserId,
        email: testUserEmail,
        name: "Test User",
      });
      expect(response.body.organizations).toHaveLength(2);

      const org1 = response.body.organizations.find(
        (org) => org.id === testOrg1Id,
      );
      expect(org1).toBeDefined();
      expect(org1?.role).toBe(Role.OWNER);
      expect(org1?.metadata).toEqual({ tier: "testing" });

      const org2 = response.body.organizations.find(
        (org) => org.id === testOrg2Id,
      );
      expect(org2).toBeDefined();
      expect(org2?.role).toBe(Role.VIEWER);
      expect(org2?.metadata).toEqual({});
    });

    it("should look up the user email case-insensitively", async () => {
      const response = await makeZodVerifiedAPICall(
        UserOrganizationsResponseSchema,
        "GET",
        userOrganizationsUrl(testUserEmail.toUpperCase()),
        undefined,
        `Bearer ${ADMIN_API_KEY}`,
        200,
      );

      expect(response.status).toBe(200);
      expect(response.body.userId).toBe(testUserId);
      expect(response.body.organizations).toHaveLength(2);
    });

    it("should return an empty list for a user without memberships", async () => {
      const response = await makeZodVerifiedAPICall(
        UserOrganizationsResponseSchema,
        "GET",
        userOrganizationsUrl(userWithoutOrgsEmail),
        undefined,
        `Bearer ${ADMIN_API_KEY}`,
        200,
      );

      expect(response.status).toBe(200);
      expect(response.body.userId).toBe(userWithoutOrgsId);
      expect(response.body.organizations).toEqual([]);
    });

    it("should return 404 for an unknown email", async () => {
      const result = await makeAPICall<{ error: string }>(
        "GET",
        userOrganizationsUrl(
          `nonexistent-${randomUUID().substring(0, 8)}@example.com`,
        ),
        undefined,
        `Bearer ${ADMIN_API_KEY}`,
      );

      expect(result.status).toBe(404);
      expect(result.body.error).toContain("User not found");
    });

    it("should return 400 for an invalid email", async () => {
      const result = await makeAPICall<{ error: string }>(
        "GET",
        userOrganizationsUrl("not-an-email"),
        undefined,
        `Bearer ${ADMIN_API_KEY}`,
      );

      expect(result.status).toBe(400);
      expect(result.body.error).toContain("Invalid email");
    });

    it("should return 401 when no authorization header is provided", async () => {
      const result = await makeAPICall<{ error: string }>(
        "GET",
        userOrganizationsUrl(testUserEmail),
      );

      expect(result.status).toBe(401);
      expect(result.body.error).toContain("Unauthorized");
    });

    it("should return 401 when an invalid admin API key is provided", async () => {
      const result = await makeAPICall<{ error: string }>(
        "GET",
        userOrganizationsUrl(testUserEmail),
        undefined,
        "Bearer invalid-admin-key",
      );

      expect(result.status).toBe(401);
      expect(result.body.error).toContain("Unauthorized");
    });

    it("should return 405 for non-GET methods", async () => {
      const result = await makeAPICall<{ error: string }>(
        "POST",
        userOrganizationsUrl(testUserEmail),
        undefined,
        `Bearer ${ADMIN_API_KEY}`,
      );

      expect(result.status).toBe(405);
      expect(result.body.error).toContain("Method Not Allowed");
    });
  });
});
