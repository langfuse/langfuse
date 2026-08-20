import {
  makeZodVerifiedAPICall,
  makeAPICall,
} from "@/src/__tests__/test-utils";
import { prisma } from "@langfuse/shared/src/db";
import { Role } from "@langfuse/shared";
import { z } from "zod";
import { randomUUID } from "crypto";
import {
  createAndAddApiKeysToDb,
  createBasicAuthHeader,
} from "@langfuse/shared/src/server";

// Schema for the user project access response
const UserProjectAccessResponseSchema = z.object({
  userId: z.string(),
  email: z.email(),
  name: z.string().nullable(),
  orgRole: z.enum(Role),
  projects: z.array(
    z.object({
      projectId: z.string(),
      name: z.string(),
      role: z.enum(Role),
      inheritedFromOrgRole: z.boolean(),
    }),
  ),
});

describe("Public User Project Access API", () => {
  let testOrgId: string;
  let projectAId: string;
  let projectBId: string;
  let deletedProjectId: string;
  let ownerUserId: string;
  let ownerEmail: string;
  let scopedUserId: string;
  let scopedEmail: string;
  let outsideUserId: string;
  let outsideEmail: string;
  let otherOrgId: string;
  let testApiKey: string;
  let testApiSecretKey: string;

  const userProjectsUrl = (email: string) =>
    `/api/public/organizations/memberships/${encodeURIComponent(email)}`;

  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: {
        name: `Test Org ${randomUUID().substring(0, 8)}`,
        cloudConfig: { plan: "Team" },
      },
    });
    testOrgId = org.id;

    // Project names are prefixed so the response ordering (by name) is deterministic
    const projectA = await prisma.project.create({
      data: {
        name: `A Project ${randomUUID().substring(0, 8)}`,
        orgId: org.id,
      },
    });
    projectAId = projectA.id;

    const projectB = await prisma.project.create({
      data: {
        name: `B Project ${randomUUID().substring(0, 8)}`,
        orgId: org.id,
      },
    });
    projectBId = projectB.id;

    const deletedProject = await prisma.project.create({
      data: {
        name: `C Deleted Project ${randomUUID().substring(0, 8)}`,
        orgId: org.id,
        deletedAt: new Date(),
      },
    });
    deletedProjectId = deletedProject.id;

    // Owner: inherits OWNER on every project
    ownerEmail = `owner-${randomUUID().substring(0, 8)}@example.com`;
    const owner = await prisma.user.create({
      data: { email: ownerEmail, name: "Owner User" },
    });
    ownerUserId = owner.id;
    await prisma.organizationMembership.create({
      data: { orgId: org.id, userId: owner.id, role: Role.OWNER },
    });

    // Scoped user: org role NONE plus an explicit project role on project A only
    scopedEmail = `scoped-${randomUUID().substring(0, 8)}@example.com`;
    const scopedUser = await prisma.user.create({
      data: { email: scopedEmail, name: "Scoped User" },
    });
    scopedUserId = scopedUser.id;
    const scopedOrgMembership = await prisma.organizationMembership.create({
      data: { orgId: org.id, userId: scopedUser.id, role: Role.NONE },
    });
    await prisma.projectMembership.create({
      data: {
        orgMembershipId: scopedOrgMembership.id,
        projectId: projectAId,
        userId: scopedUser.id,
        role: Role.ADMIN,
      },
    });

    // Outside user: exists, and is a member of a different organization
    outsideEmail = `outside-${randomUUID().substring(0, 8)}@example.com`;
    const outsideUser = await prisma.user.create({
      data: { email: outsideEmail, name: "Outside User" },
    });
    outsideUserId = outsideUser.id;
    const otherOrg = await prisma.organization.create({
      data: {
        name: `Other Org ${randomUUID().substring(0, 8)}`,
        cloudConfig: { plan: "Team" },
      },
    });
    otherOrgId = otherOrg.id;
    await prisma.organizationMembership.create({
      data: { orgId: otherOrg.id, userId: outsideUser.id, role: Role.OWNER },
    });

    const apiKey = await createAndAddApiKeysToDb({
      prisma,
      entityId: testOrgId,
      scope: "ORGANIZATION",
      note: "Test API Key for organization membership user projects API",
      predefinedKeys: {
        publicKey: `pk-lf-org-${randomUUID().substring(0, 8)}`,
        secretKey: `sk-lf-org-${randomUUID().substring(0, 8)}`,
      },
    });
    testApiKey = apiKey.publicKey;
    testApiSecretKey = apiKey.secretKey;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [ownerUserId, scopedUserId, outsideUserId] } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: [testOrgId, otherOrgId] } },
    });
  });

  describe("GET /api/public/organizations/memberships/[email]", () => {
    it("should return every project for a user inheriting the org role", async () => {
      const response = await makeZodVerifiedAPICall(
        UserProjectAccessResponseSchema,
        "GET",
        userProjectsUrl(ownerEmail),
        undefined,
        createBasicAuthHeader(testApiKey, testApiSecretKey),
        200,
      );

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        userId: ownerUserId,
        email: ownerEmail,
        name: "Owner User",
        orgRole: Role.OWNER,
      });
      expect(response.body.projects).toHaveLength(2);
      expect(response.body.projects.map((p) => p.projectId)).toEqual([
        projectAId,
        projectBId,
      ]);
      response.body.projects.forEach((project) => {
        expect(project.role).toBe(Role.OWNER);
        expect(project.inheritedFromOrgRole).toBe(true);
      });
    });

    it("should not include deleted projects", async () => {
      const response = await makeZodVerifiedAPICall(
        UserProjectAccessResponseSchema,
        "GET",
        userProjectsUrl(ownerEmail),
        undefined,
        createBasicAuthHeader(testApiKey, testApiSecretKey),
        200,
      );

      expect(response.body.projects.map((p) => p.projectId)).not.toContain(
        deletedProjectId,
      );
    });

    it("should return only projects with an explicit role for an org role of NONE", async () => {
      const response = await makeZodVerifiedAPICall(
        UserProjectAccessResponseSchema,
        "GET",
        userProjectsUrl(scopedEmail),
        undefined,
        createBasicAuthHeader(testApiKey, testApiSecretKey),
        200,
      );

      expect(response.status).toBe(200);
      expect(response.body.orgRole).toBe(Role.NONE);
      expect(response.body.projects).toHaveLength(1);
      expect(response.body.projects[0]).toMatchObject({
        projectId: projectAId,
        role: Role.ADMIN,
        inheritedFromOrgRole: false,
      });
    });

    it("should look up the email case-insensitively", async () => {
      const response = await makeZodVerifiedAPICall(
        UserProjectAccessResponseSchema,
        "GET",
        userProjectsUrl(ownerEmail.toUpperCase()),
        undefined,
        createBasicAuthHeader(testApiKey, testApiSecretKey),
        200,
      );

      expect(response.status).toBe(200);
      expect(response.body.userId).toBe(ownerUserId);
    });

    it("should return 404 for a user that belongs to another organization", async () => {
      const result = await makeAPICall<{ error: string }>(
        "GET",
        userProjectsUrl(outsideEmail),
        undefined,
        createBasicAuthHeader(testApiKey, testApiSecretKey),
      );

      expect(result.status).toBe(404);
      expect(result.body.error).toContain(
        "User not found in this organization",
      );
    });

    it("should return 404 for an unknown email", async () => {
      const result = await makeAPICall<{ error: string }>(
        "GET",
        userProjectsUrl(
          `nonexistent-${randomUUID().substring(0, 8)}@example.com`,
        ),
        undefined,
        createBasicAuthHeader(testApiKey, testApiSecretKey),
      );

      expect(result.status).toBe(404);
      expect(result.body.error).toContain(
        "User not found in this organization",
      );
    });

    it("should return 400 for an invalid email", async () => {
      const result = await makeAPICall<{ error: string }>(
        "GET",
        userProjectsUrl("not-an-email"),
        undefined,
        createBasicAuthHeader(testApiKey, testApiSecretKey),
      );

      expect(result.status).toBe(400);
      expect(result.body.error).toContain("Invalid email");
    });

    it("should return 403 when using a project-scoped API key", async () => {
      const projectApiKey = await createAndAddApiKeysToDb({
        prisma,
        entityId: projectAId,
        scope: "PROJECT",
        note: "Test Project API Key",
      });

      const result = await makeAPICall<{ error: string }>(
        "GET",
        userProjectsUrl(ownerEmail),
        undefined,
        createBasicAuthHeader(projectApiKey.publicKey, projectApiKey.secretKey),
      );

      expect(result.status).toBe(403);
      expect(result.body.error).toContain(
        "Organization-scoped API key required",
      );

      await prisma.apiKey.delete({ where: { id: projectApiKey.id } });
    });

    it("should return 401 when using an invalid API key", async () => {
      const result = await makeAPICall<{ error: string }>(
        "GET",
        userProjectsUrl(ownerEmail),
        undefined,
        createBasicAuthHeader("invalid-public-key", "invalid-secret-key"),
      );

      expect(result.status).toBe(401);
    });

    it("should return 405 for non-GET methods", async () => {
      const result = await makeAPICall<{ error: string }>(
        "POST",
        userProjectsUrl(ownerEmail),
        {},
        createBasicAuthHeader(testApiKey, testApiSecretKey),
      );

      expect(result.status).toBe(405);
      expect(result.body.error).toContain("Method not allowed");
    });
  });
});
