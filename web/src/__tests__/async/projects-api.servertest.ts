/** @jest-environment node */

import {
  makeZodVerifiedAPICall,
  makeAPICall,
} from "@/src/__tests__/test-utils";
import { z } from "zod";
import {
  createAndAddApiKeysToDb,
  createBasicAuthHeader,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { randomUUID } from "crypto";

// Schema for project response
const ProjectResponseSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
    }),
  ),
});

// Schema for project creation response
const ProjectCreationResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
});

// Schema for project deletion response
const ProjectDeletionResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

describe("Public Projects API", () => {
  // Test variables
  const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";
  const projectName = "Seed Project";
  const projectApiKey = "pk-lf-1234567890";
  const projectSecretKey = "sk-lf-1234567890";
  const invalidApiKey = "pk-lf-invalid";
  const invalidSecretKey = "sk-lf-invalid";
  const orgApiKey = `pk-lf-org-${randomUUID().substring(0, 8)}`;
  const orgSecretKey = `sk-lf-org-${randomUUID().substring(0, 8)}`;

  beforeAll(async () => {
    await createAndAddApiKeysToDb({
      prisma,
      entityId: "seed-org-id",
      scope: "ORGANIZATION",
      predefinedKeys: {
        publicKey: orgApiKey,
        secretKey: orgSecretKey,
      },
    });
  });

  describe("GET /api/public/projects", () => {
    it("should return project data with valid project API key authentication", async () => {
      const response = await makeZodVerifiedAPICall(
        ProjectResponseSchema,
        "GET",
        "/api/public/projects",
        undefined,
        createBasicAuthHeader(projectApiKey, projectSecretKey),
        200, // Expected status code is 200 OK
      );

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0]).toMatchObject({
        id: projectId,
        name: projectName,
      });
    });

    it("should return 401 when invalid API keys are provided", async () => {
      const result = await makeAPICall(
        "GET",
        "/api/public/projects",
        undefined,
        createBasicAuthHeader(invalidApiKey, invalidSecretKey),
      );
      expect(result.status).toBe(401);
      expect(result.body.message).toBeDefined();
    });

    it("should return 405 for non-GET methods", async () => {
      const result = await makeAPICall(
        "PUT", // Changed from POST to PUT since we now support POST
        "/api/public/projects",
        {},
        createBasicAuthHeader(projectApiKey, projectSecretKey),
      );
      expect(result.status).toBe(405);
      expect(result.body.message).toContain("Method not allowed");
    });

    it("should handle different authentication formats", async () => {
      // Test with Bearer token format
      const bearerResult = await makeAPICall(
        "GET",
        "/api/public/projects",
        undefined,
        `Bearer ${projectSecretKey}`,
      );
      expect(bearerResult.status).toBe(401);

      // Test with just the secret key (no Bearer prefix)
      const secretKeyResult = await makeAPICall(
        "GET",
        "/api/public/projects",
        undefined,
        projectSecretKey,
      );
      expect(secretKeyResult.status).toBe(401);
    });
  });

  describe("POST /api/public/projects", () => {
    // Clean up test projects after each test
    afterEach(async () => {
      // Delete any test projects created during tests
      await prisma.project.deleteMany({
        where: {
          name: {
            startsWith: "Test Project",
          },
        },
      });
    });

    it("should create a new project with valid organization API key", async () => {
      const uniqueProjectName = `Test Project ${randomUUID().substring(0, 8)}`;

      const response = await makeZodVerifiedAPICall(
        ProjectCreationResponseSchema,
        "POST",
        "/api/public/projects",
        {
          name: uniqueProjectName,
        },
        createBasicAuthHeader(orgApiKey, orgSecretKey),
        201, // Expected status code is 201 Created
      );

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        name: uniqueProjectName,
      });
      expect(response.body.id).toBeDefined();

      // Verify the project was actually created in the database
      const project = await prisma.project.findUnique({
        where: { id: response.body.id },
      });
      expect(project).not.toBeNull();
      expect(project?.name).toBe(uniqueProjectName);
    });

    it("should return 403 when using project API key instead of organization API key", async () => {
      const uniqueProjectName = `Test Project ${randomUUID().substring(0, 8)}`;

      const result = await makeAPICall(
        "POST",
        "/api/public/projects",
        {
          name: uniqueProjectName,
        },
        createBasicAuthHeader(projectApiKey, projectSecretKey),
      );
      expect(result.status).toBe(403);
      expect(result.body.message).toContain(
        "Organization-scoped API key required",
      );
    });

    it("should return 401 when invalid API keys are provided", async () => {
      const uniqueProjectName = `Test Project ${randomUUID().substring(0, 8)}`;

      const result = await makeAPICall(
        "POST",
        "/api/public/projects",
        {
          name: uniqueProjectName,
        },
        createBasicAuthHeader(invalidApiKey, invalidSecretKey),
      );
      expect(result.status).toBe(401);
      expect(result.body.message).toContain("Invalid credentials");
    });

    it("should return 400 when project name is invalid", async () => {
      // Test with a name that's too short
      const shortNameResult = await makeAPICall(
        "POST",
        "/api/public/projects",
        {
          name: "AB", // Too short
        },
        createBasicAuthHeader(orgApiKey, orgSecretKey),
      );
      expect(shortNameResult.status).toBe(400);
      expect(shortNameResult.body.message).toContain("Invalid project name");

      // Test with a name that's too long
      const longNameResult = await makeAPICall(
        "POST",
        "/api/public/projects",
        {
          name: "A".repeat(61), // Too long (more than 60 characters)
        },
        createBasicAuthHeader(orgApiKey, orgSecretKey),
      );
      expect(longNameResult.status).toBe(400);
      expect(longNameResult.body.message).toContain("Invalid project name");
    });

    it("should return 409 when project name already exists in the organization", async () => {
      const uniqueProjectName = `Test Project ${randomUUID().substring(0, 8)}`;

      // First create a project
      await makeAPICall(
        "POST",
        "/api/public/projects",
        {
          name: uniqueProjectName,
        },
        createBasicAuthHeader(orgApiKey, orgSecretKey),
      );

      // Try to create another project with the same name
      const duplicateResult = await makeAPICall(
        "POST",
        "/api/public/projects",
        {
          name: uniqueProjectName,
        },
        createBasicAuthHeader(orgApiKey, orgSecretKey),
      );
      expect(duplicateResult.status).toBe(409);
      expect(duplicateResult.body.message).toContain("already exists");
    });
  });

  describe("DELETE /api/public/projects/[projectId]", () => {
    let testProjectId: string;

    beforeEach(async () => {
      // Create a test project to delete
      const uniqueProjectName = `Test Project ${randomUUID().substring(0, 8)}`;
      const project = await prisma.project.create({
        data: {
          name: uniqueProjectName,
          orgId: "seed-org-id", // Same org ID used for the API key
        },
      });
      testProjectId = project.id;
    });

    afterEach(async () => {
      // Clean up any remaining test projects
      await prisma.project.deleteMany({
        where: {
          id: testProjectId,
        },
      });
    });

    it("should delete a project with valid organization API key", async () => {
      const response = await makeZodVerifiedAPICall(
        ProjectDeletionResponseSchema,
        "DELETE",
        `/api/public/projects/${testProjectId}`,
        undefined,
        createBasicAuthHeader(orgApiKey, orgSecretKey),
        202, // Expected status code is 202 Accepted
      );

      expect(response.status).toBe(202);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain("being processed asynchronously");

      // Verify the project was marked as deleted in the database
      const project = await prisma.project.findUnique({
        where: { id: testProjectId },
      });
      expect(project).not.toBeNull();
      expect(project?.deletedAt).not.toBeNull();
    });

    it("should return 403 when using project API key instead of organization API key", async () => {
      const result = await makeAPICall(
        "DELETE",
        `/api/public/projects/${testProjectId}`,
        undefined,
        createBasicAuthHeader(projectApiKey, projectSecretKey),
      );
      expect(result.status).toBe(403);
      expect(result.body.message).toContain(
        "Organization-scoped API key required",
      );
    });

    it("should return 401 when invalid API keys are provided", async () => {
      const result = await makeAPICall(
        "DELETE",
        `/api/public/projects/${testProjectId}`,
        undefined,
        createBasicAuthHeader(invalidApiKey, invalidSecretKey),
      );
      expect(result.status).toBe(401);
      expect(result.body.message).toBeDefined();
    });

    it("should return 404 when project does not exist", async () => {
      const nonExistentProjectId = randomUUID();
      const result = await makeAPICall(
        "DELETE",
        `/api/public/projects/${nonExistentProjectId}`,
        undefined,
        createBasicAuthHeader(orgApiKey, orgSecretKey),
      );
      expect(result.status).toBe(404);
      expect(result.body.message).toContain("Project not found");
    });

    it("should return 405 for non-DELETE methods", async () => {
      const result = await makeAPICall(
        "GET",
        `/api/public/projects/${testProjectId}`,
        undefined,
        createBasicAuthHeader(orgApiKey, orgSecretKey),
      );
      expect(result.status).toBe(405);
      expect(result.body.message).toContain("Method not allowed");
    });
  });
});
