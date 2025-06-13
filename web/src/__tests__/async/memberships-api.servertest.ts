/** @jest-environment node */

import {
  makeZodVerifiedAPICall,
  makeAPICall,
} from "@/src/__tests__/test-utils";
import { prisma } from "@langfuse/shared/src/db";
import { z } from "zod/v4";
import { randomUUID } from "crypto";
import { Role } from "@langfuse/shared";
import {
  createAndAddApiKeysToDb,
  createBasicAuthHeader,
} from "@langfuse/shared/src/server";

// Schema for membership response
const MembershipResponseSchema = z.object({
  userId: z.string(),
  role: z.enum(Role),
  email: z.string().email(),
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
    const apiKey = await createAndAddApiKeysToDb({
      prisma,
      entityId: testOrgId,
      scope: "ORGANIZATION",
      note: "Test API Key for Memberships API",
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
        const projectApiKey = await createAndAddApiKeysToDb({
          prisma,
          entityId: testProjectId,
          scope: "PROJECT",
          note: "Test API Key for Memberships API",
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
  });
});
