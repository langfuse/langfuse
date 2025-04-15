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
      retentionDays: z.number().nullable().optional(),
    }),
  ),
});

// Schema for project creation response
const ProjectCreationResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  retentionDays: z.number().nullable().optional(),
});

// Schema for project update response
const ProjectUpdateResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  retentionDays: z.number().nullable().optional(),
});

// Schema for project deletion response
const ProjectDeletionResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

// Schema for API keys response
const ApiKeysResponseSchema = z.object({
  apiKeys: z.array(
    z.object({
      id: z.string(),
      createdAt: z.string().or(z.date()),
      expiresAt: z.string().or(z.date()).nullable(),
      lastUsedAt: z.string().or(z.date()).nullable(),
      note: z.string().nullable(),
      publicKey: z.string(),
      displaySecretKey: z.string().nullable(),
    }),
  ),
});

// Schema for API key creation response
const ApiKeyCreationResponseSchema = z.object({
  id: z.string(),
  publicKey: z.string(),
  secretKey: z.string(),
  displaySecretKey: z.string(),
  note: z.string().nullable(),
  createdAt: z.string().or(z.date()),
  expiresAt: z.string().or(z.date()).optional(),
});

// Schema for API key deletion response
const ApiKeyDeletionResponseSchema = z.object({
  success: z.boolean(),
});

describe("Projects API", () => {
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

    it("should create a new project with retention days", async () => {
      const uniqueProjectName = `Test Project ${randomUUID().substring(0, 8)}`;

      const response = await makeZodVerifiedAPICall(
        ProjectCreationResponseSchema,
        "POST",
        "/api/public/projects",
        {
          name: uniqueProjectName,
          retention: 0, // Setting retention to 0 (no retention)
        },
        createBasicAuthHeader(orgApiKey, orgSecretKey),
        201, // Expected status code is 201 Created
      );

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        name: uniqueProjectName,
      });

      // Verify the project was created with the correct retention days
      const project = await prisma.project.findUnique({
        where: { id: response.body.id },
      });
      expect(project).not.toBeNull();
      expect(project?.retentionDays).toBe(0);
    });

    it("should validate retention days", async () => {
      const uniqueProjectName = `Test Project ${randomUUID().substring(0, 8)}`;

      // Test with invalid retention days (less than 7 and not 0)
      const invalidResult = await makeAPICall(
        "POST",
        "/api/public/projects",
        {
          name: uniqueProjectName,
          retention: 5, // Invalid: less than 7 and not 0
        },
        createBasicAuthHeader(orgApiKey, orgSecretKey),
      );
      expect(invalidResult.status).toBe(400);
      expect(invalidResult.body.message).toContain("Invalid retention value");
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

  describe("PUT /api/public/projects/[projectId]", () => {
    let testProjectId: string;

    beforeEach(async () => {
      // Create a test project to update
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
      // Clean up test projects
      await prisma.project.deleteMany({
        where: {
          id: testProjectId,
        },
      });
    });

    it("should update project retention days with valid organization API key", async () => {
      const response = await makeZodVerifiedAPICall(
        ProjectUpdateResponseSchema,
        "PUT",
        `/api/public/projects/${testProjectId}`,
        {
          name: "Updated Project Name",
          retention: 7, // Valid retention value
        },
        createBasicAuthHeader(orgApiKey, orgSecretKey),
        200, // Expected status code is 200 OK
      );

      expect(response.status).toBe(200);
      expect(response.body.name).toBe("Updated Project Name");
      expect(response.body.retentionDays).toBe(7);

      // Verify the project was updated in the database
      const project = await prisma.project.findUnique({
        where: { id: testProjectId },
      });
      expect(project).not.toBeNull();
      expect(project?.name).toBe("Updated Project Name");
      expect(project?.retentionDays).toBe(7);
    });

    it("should validate retention days on update", async () => {
      // Test with invalid retention days (less than 7 and not 0)
      const invalidResult = await makeAPICall(
        "PUT",
        `/api/public/projects/${testProjectId}`,
        {
          name: "Updated Project Name",
          retention: 5, // Invalid: less than 7 and not 0
        },
        createBasicAuthHeader(orgApiKey, orgSecretKey),
      );
      expect(invalidResult.status).toBe(400);
      expect(invalidResult.body.message).toContain("Invalid retention value");
    });

    it("should allow setting retention to 0", async () => {
      const response = await makeZodVerifiedAPICall(
        ProjectUpdateResponseSchema,
        "PUT",
        `/api/public/projects/${testProjectId}`,
        {
          name: "Updated Project Name",
          retention: 0, // Valid: 0 means no retention
        },
        createBasicAuthHeader(orgApiKey, orgSecretKey),
        200, // Expected status code is 200 OK
      );

      expect(response.status).toBe(200);
      // Retentions with value 0 are not returned.
      expect(response.body.retentionDays).toBeUndefined();
    });

    it("should return 403 when using project API key instead of organization API key", async () => {
      const result = await makeAPICall(
        "PUT",
        `/api/public/projects/${testProjectId}`,
        {
          retention: 7,
        },
        createBasicAuthHeader(projectApiKey, projectSecretKey),
      );
      expect(result.status).toBe(403);
      expect(result.body.message).toContain(
        "Organization-scoped API key required",
      );
    });

    it("should return 404 when project does not exist", async () => {
      const nonExistentProjectId = randomUUID();
      const result = await makeAPICall(
        "PUT",
        `/api/public/projects/${nonExistentProjectId}`,
        {
          retention: 7,
        },
        createBasicAuthHeader(orgApiKey, orgSecretKey),
      );
      expect(result.status).toBe(404);
      expect(result.body.message).toContain("Project not found");
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
  });

  describe("GET /api/public/projects/[projectId]/apiKeys", () => {
    it("should return API keys with valid organization API key authentication", async () => {
      const response = await makeZodVerifiedAPICall(
        ApiKeysResponseSchema,
        "GET",
        `/api/public/projects/${projectId}/apiKeys`,
        undefined,
        createBasicAuthHeader(orgApiKey, orgSecretKey),
        200, // Expected status code is 200 OK
      );

      expect(response.status).toBe(200);
      expect(response.body.apiKeys.length).toBeGreaterThanOrEqual(1);
      expect(response.body.apiKeys[0]).toHaveProperty("id");
      expect(response.body.apiKeys[0]).toHaveProperty("publicKey");
    });

    it("should return 401 when invalid API keys are provided", async () => {
      const result = await makeAPICall(
        "GET",
        `/api/public/projects/${projectId}/apiKeys`,
        undefined,
        createBasicAuthHeader(invalidApiKey, invalidSecretKey),
      );
      expect(result.status).toBe(401);
      expect(result.body.message).toBeDefined();
    });

    it("should return 403 when using project API key instead of organization API key", async () => {
      const result = await makeAPICall(
        "GET",
        `/api/public/projects/${projectId}/apiKeys`,
        undefined,
        createBasicAuthHeader(projectApiKey, projectSecretKey),
      );
      expect(result.status).toBe(403);
      expect(result.body.message).toContain(
        "Organization-scoped API key required",
      );
    });

    it("should return 404 when project does not exist", async () => {
      const nonExistentProjectId = randomUUID();
      const result = await makeAPICall(
        "GET",
        `/api/public/projects/${nonExistentProjectId}/apiKeys`,
        undefined,
        createBasicAuthHeader(orgApiKey, orgSecretKey),
      );
      expect(result.status).toBe(404);
      expect(result.body.message).toContain("Project not found");
    });

    it("should return 405 for non-GET/POST methods", async () => {
      const result = await makeAPICall(
        "PUT",
        `/api/public/projects/${projectId}/apiKeys`,
        {},
        createBasicAuthHeader(orgApiKey, orgSecretKey),
      );
      expect(result.status).toBe(405);
      expect(result.body.message).toContain("Method Not Allowed");
    });
  });

  describe("POST /api/public/projects/[projectId]/apiKeys", () => {
    let createdApiKeyId: string;

    afterEach(async () => {
      // Clean up any API keys created during tests
      if (createdApiKeyId) {
        await prisma.apiKey.deleteMany({
          where: {
            id: createdApiKeyId,
          },
        });
        createdApiKeyId = "";
      }
    });

    it("should create a new API key with valid organization API key", async () => {
      const note = `Test API Key ${randomUUID().substring(0, 8)}`;

      const response = await makeZodVerifiedAPICall(
        ApiKeyCreationResponseSchema,
        "POST",
        `/api/public/projects/${projectId}/apiKeys`,
        {
          note,
        },
        createBasicAuthHeader(orgApiKey, orgSecretKey),
        201, // Expected status code is 201 Created
      );

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty("id");
      expect(response.body).toHaveProperty("publicKey");
      expect(response.body).toHaveProperty("secretKey");
      expect(response.body.note).toBe(note);

      // Store the created API key ID for cleanup
      createdApiKeyId = response.body.id;

      // Verify the API key was actually created in the database
      const apiKey = await prisma.apiKey.findUnique({
        where: { id: response.body.id },
      });
      expect(apiKey).not.toBeNull();
      expect(apiKey?.note).toBe(note);
      expect(apiKey?.projectId).toBe(projectId);
      expect(apiKey?.scope).toBe("PROJECT");
    });

    it("should return 403 when using project API key instead of organization API key", async () => {
      const note = `Test API Key ${randomUUID().substring(0, 8)}`;

      const result = await makeAPICall(
        "POST",
        `/api/public/projects/${projectId}/apiKeys`,
        {
          note,
        },
        createBasicAuthHeader(projectApiKey, projectSecretKey),
      );
      expect(result.status).toBe(403);
      expect(result.body.message).toContain(
        "Organization-scoped API key required",
      );
    });

    it("should return 401 when invalid API keys are provided", async () => {
      const note = `Test API Key ${randomUUID().substring(0, 8)}`;

      const result = await makeAPICall(
        "POST",
        `/api/public/projects/${projectId}/apiKeys`,
        {
          note,
        },
        createBasicAuthHeader(invalidApiKey, invalidSecretKey),
      );
      expect(result.status).toBe(401);
      expect(result.body.message).toBeDefined();
    });

    it("should return 404 when project does not exist", async () => {
      const nonExistentProjectId = randomUUID();
      const note = `Test API Key ${randomUUID().substring(0, 8)}`;

      const result = await makeAPICall(
        "POST",
        `/api/public/projects/${nonExistentProjectId}/apiKeys`,
        {
          note,
        },
        createBasicAuthHeader(orgApiKey, orgSecretKey),
      );
      expect(result.status).toBe(404);
      expect(result.body.message).toContain("Project not found");
    });
  });

  describe("DELETE /api/public/projects/[projectId]/apiKeys/[apiKeyId]", () => {
    let deleteTestApiKeyId: string;

    beforeEach(async () => {
      // Create a test API key to delete
      const apiKeyMeta = await createAndAddApiKeysToDb({
        prisma,
        entityId: projectId,
        scope: "PROJECT",
        note: `Delete Test API Key ${randomUUID().substring(0, 8)}`,
      });
      deleteTestApiKeyId = apiKeyMeta.id;
    });

    afterEach(async () => {
      // Clean up any remaining test API keys
      try {
        await prisma.apiKey.deleteMany({
          where: {
            id: deleteTestApiKeyId,
          },
        });
      } catch (error) {
        // Ignore errors if the API key was already deleted by the test
      }
    });

    it("should delete an API key with valid organization API key", async () => {
      const response = await makeZodVerifiedAPICall(
        ApiKeyDeletionResponseSchema,
        "DELETE",
        `/api/public/projects/${projectId}/apiKeys/${deleteTestApiKeyId}`,
        undefined,
        createBasicAuthHeader(orgApiKey, orgSecretKey),
        200, // Expected status code is 200 OK
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify the API key was actually deleted from the database
      const apiKey = await prisma.apiKey.findUnique({
        where: { id: deleteTestApiKeyId },
      });
      expect(apiKey).toBeNull();
    });

    it("should return 403 when using project API key instead of organization API key", async () => {
      const result = await makeAPICall(
        "DELETE",
        `/api/public/projects/${projectId}/apiKeys/${deleteTestApiKeyId}`,
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
        `/api/public/projects/${projectId}/apiKeys/${deleteTestApiKeyId}`,
        undefined,
        createBasicAuthHeader(invalidApiKey, invalidSecretKey),
      );
      expect(result.status).toBe(401);
      expect(result.body.message).toBeDefined();
    });

    it("should return 404 when API key does not exist", async () => {
      const nonExistentApiKeyId = randomUUID();
      const result = await makeAPICall(
        "DELETE",
        `/api/public/projects/${projectId}/apiKeys/${nonExistentApiKeyId}`,
        undefined,
        createBasicAuthHeader(orgApiKey, orgSecretKey),
      );
      expect(result.status).toBe(404);
      expect(result.body.message).toContain("API key not found");
    });

    it("should return 404 when project does not exist", async () => {
      const nonExistentProjectId = randomUUID();
      const result = await makeAPICall(
        "DELETE",
        `/api/public/projects/${nonExistentProjectId}/apiKeys/${deleteTestApiKeyId}`,
        undefined,
        createBasicAuthHeader(orgApiKey, orgSecretKey),
      );
      expect(result.status).toBe(404);
      expect(result.body.message).toContain("Project not found");
    });
  });

  it("should return 405 for unallowed methods", async () => {
    const result = await makeAPICall(
      "PATCH",
      `/api/public/projects/${projectId}`,
      undefined,
      createBasicAuthHeader(orgApiKey, orgSecretKey),
    );
    expect(result.status).toBe(405);
    expect(result.body.message).toContain("Method not allowed");
  });
});
