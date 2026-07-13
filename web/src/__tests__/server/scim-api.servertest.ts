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
import { verifyPassword } from "@/src/features/auth-credentials/lib/credentialsServerUtils";

// Schema for SCIM User response
const ScimUserSchema = z.object({
  schemas: z.array(z.string()),
  id: z.string(),
  userName: z.string(),
  name: z
    .object({
      formatted: z.string().nullable(),
    })
    .optional(),
  emails: z
    .array(
      z.object({
        primary: z.boolean(),
        value: z.string(),
        type: z.string(),
      }),
    )
    .optional(),
  meta: z.object({
    resourceType: z.string(),
    created: z.string().optional(),
    lastModified: z.string().optional(),
  }),
});

// Schema for SCIM Users list response
const ScimUsersListSchema = z.object({
  schemas: z.array(z.string()),
  totalResults: z.number(),
  startIndex: z.number(),
  itemsPerPage: z.number(),
  Resources: z.array(ScimUserSchema),
});

// Schema for SCIM Service Provider Config response
const ServiceProviderConfigSchema = z.object({
  schemas: z.array(z.string()),
  documentationUri: z.string(),
  patch: z.object({
    supported: z.boolean(),
  }),
  bulk: z.object({
    supported: z.boolean(),
    maxOperations: z.number(),
    maxPayloadSize: z.number(),
  }),
  filter: z.object({
    supported: z.boolean(),
    maxResults: z.number(),
  }),
  changePassword: z.object({
    supported: z.boolean(),
  }),
  sort: z.object({
    supported: z.boolean(),
  }),
  etag: z.object({
    supported: z.boolean(),
  }),
  authenticationSchemes: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      specUri: z.string(),
      type: z.string(),
      primary: z.boolean(),
    }),
  ),
  meta: z.object({
    resourceType: z.string(),
    location: z.string(),
  }),
});

// Schema for SCIM Schemas response
const SchemasResponseSchema = z.object({
  schemas: z.array(z.string()),
  totalResults: z.number(),
  Resources: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      attributes: z.array(z.any()),
      meta: z.object({
        resourceType: z.string(),
        location: z.string(),
      }),
    }),
  ),
});

// Schema for SCIM Resource Types response
const ResourceTypesResponseSchema = z.object({
  schemas: z.array(z.string()),
  totalResults: z.number(),
  Resources: z.array(
    z.object({
      schemas: z.array(z.string()),
      id: z.string(),
      name: z.string(),
      endpoint: z.string(),
      description: z.string(),
      schema: z.string(),
      schemaExtensions: z.array(
        z.object({
          schema: z.string(),
          required: z.boolean(),
        }),
      ),
      meta: z.object({
        resourceType: z.string(),
        location: z.string(),
      }),
    }),
  ),
});

describe("SCIM API", () => {
  // Test variables
  const orgId = "seed-org-id";
  const orgApiKey = `pk-lf-org-${randomUUID().substring(0, 8)}`;
  const orgSecretKey = `sk-lf-org-${randomUUID().substring(0, 8)}`;
  const projectApiKey = "pk-lf-1234567890";
  const projectSecretKey = "sk-lf-1234567890";
  const invalidApiKey = "pk-lf-invalid";
  const invalidSecretKey = "sk-lf-invalid";
  let testUserId: string;

  beforeAll(async () => {
    await createAndAddApiKeysToDb({
      prisma,
      entityId: orgId,
      scope: "ORGANIZATION",
      predefinedKeys: {
        publicKey: orgApiKey,
        secretKey: orgSecretKey,
      },
    });
  });

  describe("GET /api/public/scim/ServiceProviderConfig", () => {
    it("should return service provider configuration with valid organization API key", async () => {
      const response = await makeZodVerifiedAPICall(
        ServiceProviderConfigSchema,
        "GET",
        "/api/public/scim/ServiceProviderConfig",
        undefined,
        createBasicAuthHeader(orgApiKey, orgSecretKey),
        200,
      );

      expect(response.status).toBe(200);
      expect(response.body.schemas).toContain(
        "urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig",
      );
      expect(response.body.patch.supported).toBe(false);
      expect(response.body.filter.supported).toBe(true);
    });

    it("should return 401 when invalid API keys are provided", async () => {
      const result = await makeAPICall(
        "GET",
        "/api/public/scim/ServiceProviderConfig",
        undefined,
        createBasicAuthHeader(invalidApiKey, invalidSecretKey),
      );
      expect(result.status).toBe(401);
      expect(result.body.detail).toBeDefined();
    });

    it("should return 403 when using project API key instead of organization API key", async () => {
      const result = await makeAPICall(
        "GET",
        "/api/public/scim/ServiceProviderConfig",
        undefined,
        createBasicAuthHeader(projectApiKey, projectSecretKey),
      );
      expect(result.status).toBe(403);
      expect(result.body.detail).toContain(
        "Organization-scoped API key required",
      );
    });

    it("should return 405 for non-GET methods", async () => {
      const result = await makeAPICall(
        "POST",
        "/api/public/scim/ServiceProviderConfig",
        {},
        createBasicAuthHeader(orgApiKey, orgSecretKey),
      );
      expect(result.status).toBe(405);
      expect(result.body.detail).toContain("Method not allowed");
    });
  });

  describe("GET /api/public/scim/Schemas", () => {
    it("should return schemas with valid organization API key", async () => {
      const response = await makeZodVerifiedAPICall(
        SchemasResponseSchema,
        "GET",
        "/api/public/scim/Schemas",
        undefined,
        createBasicAuthHeader(orgApiKey, orgSecretKey),
        200,
      );

      expect(response.status).toBe(200);
      expect(response.body.schemas).toContain(
        "urn:ietf:params:scim:api:messages:2.0:ListResponse",
      );
      expect(response.body.Resources.length).toBeGreaterThan(0);
      expect(response.body.Resources[0].id).toContain(
        "urn:ietf:params:scim:schemas:core:2.0:User",
      );
    });

    it("should return 401 when invalid API keys are provided", async () => {
      const result = await makeAPICall(
        "GET",
        "/api/public/scim/Schemas",
        undefined,
        createBasicAuthHeader(invalidApiKey, invalidSecretKey),
      );
      expect(result.status).toBe(401);
      expect(result.body.detail).toBeDefined();
    });

    it("should return 403 when using project API key instead of organization API key", async () => {
      const result = await makeAPICall(
        "GET",
        "/api/public/scim/Schemas",
        undefined,
        createBasicAuthHeader(projectApiKey, projectSecretKey),
      );
      expect(result.status).toBe(403);
      expect(result.body.detail).toContain(
        "Organization-scoped API key required",
      );
    });

    it("should return 405 for non-GET methods", async () => {
      const result = await makeAPICall(
        "POST",
        "/api/public/scim/Schemas",
        {},
        createBasicAuthHeader(orgApiKey, orgSecretKey),
      );
      expect(result.status).toBe(405);
      expect(result.body.detail).toContain("Method not allowed");
    });
  });

  describe("GET /api/public/scim/ResourceTypes", () => {
    it("should return resource types with valid organization API key", async () => {
      const response = await makeZodVerifiedAPICall(
        ResourceTypesResponseSchema,
        "GET",
        "/api/public/scim/ResourceTypes",
        undefined,
        createBasicAuthHeader(orgApiKey, orgSecretKey),
        200,
      );

      expect(response.status).toBe(200);
      expect(response.body.schemas).toContain(
        "urn:ietf:params:scim:api:messages:2.0:ListResponse",
      );
      expect(response.body.Resources.length).toBeGreaterThan(0);
      expect(response.body.Resources[0].id).toBe("User");
      expect(response.body.Resources[0].endpoint).toBe(
        "/api/public/scim/Users",
      );
    });

    it("should return 401 when invalid API keys are provided", async () => {
      const result = await makeAPICall(
        "GET",
        "/api/public/scim/ResourceTypes",
        undefined,
        createBasicAuthHeader(invalidApiKey, invalidSecretKey),
      );
      expect(result.status).toBe(401);
      expect(result.body.detail).toBeDefined();
    });

    it("should return 403 when using project API key instead of organization API key", async () => {
      const result = await makeAPICall(
        "GET",
        "/api/public/scim/ResourceTypes",
        undefined,
        createBasicAuthHeader(projectApiKey, projectSecretKey),
      );
      expect(result.status).toBe(403);
      expect(result.body.detail).toContain(
        "Organization-scoped API key required",
      );
    });

    it("should return 405 for non-GET methods", async () => {
      const result = await makeAPICall(
        "POST",
        "/api/public/scim/ResourceTypes",
        {},
        createBasicAuthHeader(orgApiKey, orgSecretKey),
      );
      expect(result.status).toBe(405);
      expect(result.body.detail).toContain("Method not allowed");
    });
  });

  describe("SCIM Users API", () => {
    // Clean up test users after each test
    afterEach(async () => {
      if (testUserId) {
        await prisma.user.deleteMany({
          where: {
            id: testUserId,
          },
        });
        testUserId = "";
      }
    });

    describe("GET /api/public/scim/Users", () => {
      it("should return users with valid organization API key", async () => {
        const response = await makeZodVerifiedAPICall(
          ScimUsersListSchema,
          "GET",
          "/api/public/scim/Users",
          undefined,
          createBasicAuthHeader(orgApiKey, orgSecretKey),
          200,
        );

        expect(response.status).toBe(200);
        expect(response.body.schemas).toContain(
          "urn:ietf:params:scim:api:messages:2.0:ListResponse",
        );
        expect(response.body.totalResults).toBeGreaterThanOrEqual(0);
        expect(response.body.startIndex).toBe(1);
      });

      it("should support filtering by userName", async () => {
        // First create a test user
        const uniqueEmail = `test.user.${randomUUID().substring(0, 8)}@example.com`;
        const createResponse = await makeAPICall(
          "POST",
          "/api/public/scim/Users",
          {
            userName: uniqueEmail,
            name: {
              formatted: "Test User",
            },
            emails: [
              {
                primary: true,
                value: uniqueEmail,
                type: "work",
              },
            ],
            active: true,
          },
          createBasicAuthHeader(orgApiKey, orgSecretKey),
        );

        expect(createResponse.status).toBe(201);
        testUserId = createResponse.body.id;

        // Now filter for this user
        const response = await makeZodVerifiedAPICall(
          ScimUsersListSchema,
          "GET",
          `/api/public/scim/Users?filter=userName eq "${uniqueEmail}"`,
          undefined,
          createBasicAuthHeader(orgApiKey, orgSecretKey),
          200,
        );

        expect(response.status).toBe(200);
        expect(response.body.totalResults).toBe(1);
        expect(response.body.Resources[0].userName).toBe(uniqueEmail);
      });

      it("should return 401 when invalid API keys are provided", async () => {
        const result = await makeAPICall(
          "GET",
          "/api/public/scim/Users",
          undefined,
          createBasicAuthHeader(invalidApiKey, invalidSecretKey),
        );
        expect(result.status).toBe(401);
        expect(result.body.detail).toBeDefined();
      });

      it("should return 403 when using project API key instead of organization API key", async () => {
        const result = await makeAPICall(
          "GET",
          "/api/public/scim/Users",
          undefined,
          createBasicAuthHeader(projectApiKey, projectSecretKey),
        );
        expect(result.status).toBe(403);
        expect(result.body.detail).toContain(
          "Organization-scoped API key required",
        );
      });

      it("should return 405 for non-GET/POST methods", async () => {
        const result = await makeAPICall(
          "PUT",
          "/api/public/scim/Users",
          {},
          createBasicAuthHeader(orgApiKey, orgSecretKey),
        );
        expect(result.status).toBe(405);
        expect(result.body.detail).toContain("Method not allowed");
      });
    });

    describe("POST /api/public/scim/Users", () => {
      it("should create a new user with valid organization API key", async () => {
        const uniqueEmail = `test.user.${randomUUID().substring(0, 8)}@example.com`;
        const response = await makeZodVerifiedAPICall(
          ScimUserSchema,
          "POST",
          "/api/public/scim/Users",
          {
            userName: uniqueEmail,
            name: {
              formatted: "Test User",
            },
            emails: [
              {
                primary: true,
                value: uniqueEmail,
                type: "work",
              },
            ],
            active: true,
          },
          createBasicAuthHeader(orgApiKey, orgSecretKey),
          201,
        );

        expect(response.status).toBe(201);
        expect(response.body.userName).toBe(uniqueEmail);
        expect(response.body.name.formatted).toBe("Test User");
        expect(response.body.emails[0].value).toBe(uniqueEmail);

        testUserId = response.body.id;

        // Verify the user was actually created in the database
        const user = await prisma.user.findUnique({
          where: { id: testUserId },
        });
        expect(user).not.toBeNull();
        expect(user?.email).toBe(uniqueEmail);
        expect(user?.name).toBe("Test User");
      });

      it("should create a new user with password", async () => {
        const uniqueEmail = `test.user.${randomUUID().substring(0, 8)}@example.com`;
        const password = `password-${randomUUID().substring(0, 8)}`;
        const response = await makeZodVerifiedAPICall(
          ScimUserSchema,
          "POST",
          "/api/public/scim/Users",
          {
            userName: uniqueEmail,
            name: {
              formatted: "Test User With Password",
            },
            emails: [
              {
                primary: true,
                value: uniqueEmail,
                type: "work",
              },
            ],
            active: true,
            password: password,
          },
          createBasicAuthHeader(orgApiKey, orgSecretKey),
          201,
        );

        expect(response.status).toBe(201);
        expect(response.body.userName).toBe(uniqueEmail);
        expect(response.body.name.formatted).toBe("Test User With Password");
        expect(response.body.emails[0].value).toBe(uniqueEmail);
        // Password should not be returned in the response
        expect(response.body.password).toBeUndefined();

        testUserId = response.body.id;

        // Verify the user was actually created in the database
        const user = await prisma.user.findUnique({
          where: { id: testUserId },
        });
        expect(user).not.toBeNull();
        expect(user?.email).toBe(uniqueEmail);
        expect(user?.name).toBe("Test User With Password");
        // Verify password was created
        expect(user?.password).not.toBeNull();
        expect(await verifyPassword(password, user?.password ?? "")).toBe(true);
      });

      it("should return 400 when userName is missing", async () => {
        const result = await makeAPICall(
          "POST",
          "/api/public/scim/Users",
          {
            name: {
              formatted: "Test User",
            },
          },
          createBasicAuthHeader(orgApiKey, orgSecretKey),
        );
        expect(result.status).toBe(400);
        expect(result.body.detail).toContain("userName is required");
      });

      it("should create a new user with specified role", async () => {
        const uniqueEmail = `test.user.${randomUUID().substring(0, 8)}@example.com`;
        const response = await makeZodVerifiedAPICall(
          ScimUserSchema,
          "POST",
          "/api/public/scim/Users",
          {
            userName: uniqueEmail,
            name: {
              formatted: "Test User With Role",
            },
            emails: [
              {
                primary: true,
                value: uniqueEmail,
                type: "work",
              },
            ],
            active: true,
            roles: ["ADMIN"],
          },
          createBasicAuthHeader(orgApiKey, orgSecretKey),
          201,
        );

        expect(response.status).toBe(201);
        expect(response.body.userName).toBe(uniqueEmail);
        expect(response.body.name.formatted).toBe("Test User With Role");

        testUserId = response.body.id;

        // Verify the user was created with the specified role
        const orgMemberships = await prisma.organizationMembership.findMany({
          where: { userId: testUserId, orgId: orgId },
        });
        expect(orgMemberships.length).toBe(1);
        expect(orgMemberships[0].role).toBe("ADMIN");
      });

      it("should write an audit log entry when creating a user", async () => {
        const uniqueEmail = `test.user.${randomUUID().substring(0, 8)}@example.com`;
        const response = await makeAPICall(
          "POST",
          "/api/public/scim/Users",
          {
            userName: uniqueEmail,
            name: {
              formatted: "Audited User",
            },
            roles: ["MEMBER"],
          },
          createBasicAuthHeader(orgApiKey, orgSecretKey),
        );

        expect(response.status).toBe(201);
        testUserId = response.body.id;

        const orgMembership = await prisma.organizationMembership.findFirst({
          where: { userId: testUserId, orgId: orgId },
        });
        expect(orgMembership).not.toBeNull();

        const auditLogs = await prisma.auditLog.findMany({
          where: {
            resourceType: "orgMembership",
            resourceId: orgMembership!.id,
            action: "create",
            orgId: orgId,
          },
        });
        expect(auditLogs.length).toBe(1);
        expect(auditLogs[0].apiKeyId).not.toBeNull();
        expect(auditLogs[0].userId).toBeNull();
        expect(auditLogs[0].after).toContain(orgMembership!.id);
      });

      it("should return 409 when user with the same userName already exists", async () => {
        const uniqueEmail = `test.user.${randomUUID().substring(0, 8)}@example.com`;

        // First create a user
        const createResponse = await makeAPICall(
          "POST",
          "/api/public/scim/Users",
          {
            userName: uniqueEmail,
            name: {
              formatted: "Test User",
            },
          },
          createBasicAuthHeader(orgApiKey, orgSecretKey),
        );
        expect(createResponse.status).toBe(201);
        testUserId = createResponse.body.id;

        // Try to create another user with the same userName
        const duplicateResult = await makeAPICall(
          "POST",
          "/api/public/scim/Users",
          {
            userName: uniqueEmail,
            name: {
              formatted: "Another User",
            },
          },
          createBasicAuthHeader(orgApiKey, orgSecretKey),
        );
        expect(duplicateResult.status).toBe(409);
        expect(duplicateResult.body.detail).toContain("already exists");
      });

      it("should return 409 when userName differs only by email case", async () => {
        const localPart = `Mixed.Case.${randomUUID().substring(0, 8)}`;
        const mixedCaseEmail = `${localPart}@Example.com`;
        const lowerCaseEmail = `${localPart.toLowerCase()}@example.com`;

        // Create with mixed-case userName
        const createResponse = await makeAPICall(
          "POST",
          "/api/public/scim/Users",
          {
            userName: mixedCaseEmail,
            name: {
              formatted: "Test User",
            },
          },
          createBasicAuthHeader(orgApiKey, orgSecretKey),
        );
        expect(createResponse.status).toBe(201);
        testUserId = createResponse.body.id;

        // The stored user email should be lowercased
        const storedUser = await prisma.user.findUnique({
          where: { id: testUserId },
        });
        expect(storedUser?.email).toBe(lowerCaseEmail);

        // Re-POST with a case-variant userName: must be detected as duplicate
        const duplicateResult = await makeAPICall(
          "POST",
          "/api/public/scim/Users",
          {
            userName: lowerCaseEmail,
            name: {
              formatted: "Another User",
            },
          },
          createBasicAuthHeader(orgApiKey, orgSecretKey),
        );
        expect(duplicateResult.status).toBe(409);
        expect(duplicateResult.body.detail).toContain("already exists");

        // No duplicate org membership should have been created
        const orgMemberships = await prisma.organizationMembership.findMany({
          where: { userId: testUserId, orgId },
        });
        expect(orgMemberships.length).toBe(1);
      });
    });

    describe("GET /api/public/scim/Users/{id}", () => {
      beforeEach(async () => {
        // Create a test user
        const uniqueEmail = `test.user.${randomUUID().substring(0, 8)}@example.com`;
        const user = await prisma.user.create({
          data: {
            email: uniqueEmail,
            name: "Test User",
          },
        });
        await prisma.organizationMembership.create({
          data: {
            userId: user.id,
            orgId: orgId,
            role: "NONE",
          },
        });

        testUserId = user.id;
      });

      it("should return a specific user with valid organization API key", async () => {
        const response = await makeZodVerifiedAPICall(
          ScimUserSchema,
          "GET",
          `/api/public/scim/Users/${testUserId}`,
          undefined,
          createBasicAuthHeader(orgApiKey, orgSecretKey),
          200,
        );

        expect(response.status).toBe(200);
        expect(response.body.id).toBe(testUserId);
        expect(response.body.name.formatted).toBe("Test User");
      });

      it("should return 404 when user does not exist", async () => {
        const nonExistentUserId = randomUUID();
        const result = await makeAPICall(
          "GET",
          `/api/public/scim/Users/${nonExistentUserId}`,
          undefined,
          createBasicAuthHeader(orgApiKey, orgSecretKey),
        );
        expect(result.status).toBe(404);
        expect(result.body.detail).toContain("User not found");
      });
    });

    describe("PUT /api/public/scim/Users/{id}", () => {
      beforeEach(async () => {
        // Create a test user
        const uniqueEmail = `test.user.${randomUUID().substring(0, 8)}@example.com`;
        const user = await prisma.user.create({
          data: {
            email: uniqueEmail,
            name: "Test User",
          },
        });
        await prisma.organizationMembership.create({
          data: {
            userId: user.id,
            orgId: orgId,
            role: "NONE",
          },
        });
        testUserId = user.id;
      });

      it("should deactivate a user when active is false", async () => {
        const response = await makeZodVerifiedAPICall(
          ScimUserSchema,
          "PUT",
          `/api/public/scim/Users/${testUserId}`,
          {
            schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
            id: testUserId,
            userName: "test.user@example.com",
            active: false,
          },
          createBasicAuthHeader(orgApiKey, orgSecretKey),
          200,
        );

        expect(response.status).toBe(200);
        expect(response.body.id).toBe(testUserId);

        // Verify the user was removed from the organization
        const orgMemberships = await prisma.organizationMembership.findMany({
          where: { userId: testUserId, orgId: orgId },
        });
        expect(orgMemberships.length).toBe(0);
      });

      it("should reactivate a user when active is true", async () => {
        // First deactivate the user
        await prisma.organizationMembership.deleteMany({
          where: { userId: testUserId, orgId: orgId },
        });

        const response = await makeZodVerifiedAPICall(
          ScimUserSchema,
          "PUT",
          `/api/public/scim/Users/${testUserId}`,
          {
            schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
            id: testUserId,
            userName: "test.user@example.com",
            active: true,
          },
          createBasicAuthHeader(orgApiKey, orgSecretKey),
          200,
        );

        expect(response.status).toBe(200);
        expect(response.body.id).toBe(testUserId);

        // Verify the user was re-added to the organization with default role
        const orgMemberships = await prisma.organizationMembership.findMany({
          where: { userId: testUserId, orgId: orgId },
        });
        expect(orgMemberships.length).toBe(1);
        expect(orgMemberships[0].role).toBe("NONE");
      });

      it("should reactivate a user with specified role", async () => {
        // First deactivate the user
        await prisma.organizationMembership.deleteMany({
          where: { userId: testUserId, orgId: orgId },
        });

        const response = await makeZodVerifiedAPICall(
          ScimUserSchema,
          "PUT",
          `/api/public/scim/Users/${testUserId}`,
          {
            schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
            id: testUserId,
            userName: "test.user@example.com",
            active: true,
            roles: ["MEMBER"],
          },
          createBasicAuthHeader(orgApiKey, orgSecretKey),
          200,
        );

        expect(response.status).toBe(200);
        expect(response.body.id).toBe(testUserId);

        // Verify the user was re-added to the organization with specified role
        const orgMemberships = await prisma.organizationMembership.findMany({
          where: { userId: testUserId, orgId: orgId },
        });
        expect(orgMemberships.length).toBe(1);
        expect(orgMemberships[0].role).toBe("MEMBER");
      });

      it("should create the membership with NONE when no roles are provided (PUT active:true)", async () => {
        await prisma.organizationMembership.deleteMany({
          where: { userId: testUserId, orgId: orgId },
        });

        const response = await makeAPICall(
          "PUT",
          `/api/public/scim/Users/${testUserId}`,
          {
            schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
            id: testUserId,
            userName: "test.user@example.com",
            active: true,
          },
          createBasicAuthHeader(orgApiKey, orgSecretKey),
        );
        expect(response.status).toBe(200);

        const membership = await prisma.organizationMembership.findFirst({
          where: { userId: testUserId, orgId: orgId },
        });
        expect(membership).not.toBeNull();
        expect(membership!.role).toBe("NONE");

        // Provisioning a new membership writes a create audit entry.
        const auditLogs = await prisma.auditLog.findMany({
          where: {
            resourceType: "orgMembership",
            resourceId: membership!.id,
            action: "create",
            orgId: orgId,
          },
        });
        expect(auditLogs.length).toBe(1);
        expect(auditLogs[0].apiKeyId).not.toBeNull();
        expect(auditLogs[0].userId).toBeNull();
        expect(auditLogs[0].after).toContain(membership!.id);
      });

      it("should NOT modify an existing member's role when no roles are provided (PUT active:true, no downgrade)", async () => {
        // Simulate a real, elevated member (the role someone set in-app or via
        // the create flow).
        await prisma.organizationMembership.updateMany({
          where: { userId: testUserId, orgId: orgId },
          data: { role: "MEMBER" },
        });
        const before = await prisma.organizationMembership.findFirst({
          where: { userId: testUserId, orgId: orgId },
        });
        expect(before?.role).toBe("MEMBER");

        // A periodic IdP full-sync re-sends active:true WITHOUT roles — it must
        // not touch the existing role.
        const response = await makeZodVerifiedAPICall(
          ScimUserSchema,
          "PUT",
          `/api/public/scim/Users/${testUserId}`,
          {
            schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
            id: testUserId,
            userName: "test.user@example.com",
            active: true,
          },
          createBasicAuthHeader(orgApiKey, orgSecretKey),
          200,
        );
        expect(response.status).toBe(200);

        const after = await prisma.organizationMembership.findMany({
          where: { userId: testUserId, orgId: orgId },
        });
        expect(after.length).toBe(1);
        expect(after[0].role).toBe("MEMBER");
        expect(after[0].id).toBe(before!.id);

        // No-op must not write an audit log entry.
        const auditLogs = await prisma.auditLog.findMany({
          where: {
            resourceType: "orgMembership",
            resourceId: before!.id,
            orgId: orgId,
          },
        });
        expect(auditLogs.length).toBe(0);
      });

      it("should write a delete audit log when PUT active:false deprovisions a membership", async () => {
        const before = await prisma.organizationMembership.findFirst({
          where: { userId: testUserId, orgId: orgId },
        });
        expect(before).not.toBeNull();

        const response = await makeAPICall(
          "PUT",
          `/api/public/scim/Users/${testUserId}`,
          {
            schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
            id: testUserId,
            userName: "test.user@example.com",
            active: false,
          },
          createBasicAuthHeader(orgApiKey, orgSecretKey),
        );
        expect(response.status).toBe(200);

        const remaining = await prisma.organizationMembership.findMany({
          where: { userId: testUserId, orgId: orgId },
        });
        expect(remaining.length).toBe(0);

        const auditLogs = await prisma.auditLog.findMany({
          where: {
            resourceType: "orgMembership",
            resourceId: before!.id,
            action: "delete",
            orgId: orgId,
          },
        });
        expect(auditLogs.length).toBe(1);
        expect(auditLogs[0].apiKeyId).not.toBeNull();
        expect(auditLogs[0].before).toContain(before!.id);
      });

      it("should return 400 when SCIM schema is missing", async () => {
        const result = await makeAPICall(
          "PUT",
          `/api/public/scim/Users/${testUserId}`,
          {
            id: testUserId,
            userName: "test.user@example.com",
            active: false,
          },
          createBasicAuthHeader(orgApiKey, orgSecretKey),
        );
        expect(result.status).toBe(400);
        expect(result.body.detail).toContain("schemas");
      });

      it("should return 404 when user does not exist", async () => {
        const nonExistentUserId = randomUUID();
        const result = await makeAPICall(
          "PUT",
          `/api/public/scim/Users/${nonExistentUserId}`,
          {
            schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
            id: nonExistentUserId,
            userName: "test.user@example.com",
            active: false,
          },
          createBasicAuthHeader(orgApiKey, orgSecretKey),
        );
        expect(result.status).toBe(404);
        expect(result.body.detail).toContain("User not found");
      });
    });

    describe("DELETE /api/public/scim/Users/{id}", () => {
      beforeEach(async () => {
        // Create a test user
        const uniqueEmail = `test.user.${randomUUID().substring(0, 8)}@example.com`;
        const user = await prisma.user.create({
          data: {
            email: uniqueEmail,
            name: "Test User",
          },
        });
        await prisma.organizationMembership.create({
          data: {
            userId: user.id,
            orgId: orgId,
            role: "NONE",
          },
        });
        testUserId = user.id;
      });

      it("should delete a user with valid organization API key", async () => {
        try {
          await makeAPICall(
            "DELETE",
            `/api/public/scim/Users/${testUserId}`,
            undefined,
            createBasicAuthHeader(orgApiKey, orgSecretKey),
          );
        } catch (_e) {
          // ignore
        }

        const orgMemberships = await prisma.organizationMembership.findMany({
          where: { id: testUserId },
        });
        expect(orgMemberships.length).toBe(0);
      });

      it("should write a delete audit log when DELETE removes a membership", async () => {
        const before = await prisma.organizationMembership.findFirst({
          where: { userId: testUserId, orgId: orgId },
        });
        expect(before).not.toBeNull();

        try {
          await makeAPICall(
            "DELETE",
            `/api/public/scim/Users/${testUserId}`,
            undefined,
            createBasicAuthHeader(orgApiKey, orgSecretKey),
          );
        } catch (_e) {
          // ignore
        }

        const auditLogs = await prisma.auditLog.findMany({
          where: {
            resourceType: "orgMembership",
            resourceId: before!.id,
            action: "delete",
            orgId: orgId,
          },
        });
        expect(auditLogs.length).toBe(1);
        expect(auditLogs[0].apiKeyId).not.toBeNull();
        expect(auditLogs[0].before).toContain(before!.id);
      });

      it("should capture cascade-deleted project memberships in the delete audit before payload", async () => {
        // Seeded project that belongs to seed-org-id.
        const seededProjectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";
        const orgMembership =
          await prisma.organizationMembership.findFirstOrThrow({
            where: { userId: testUserId, orgId: orgId },
          });
        // Give the user project-level access. This row is cascade-deleted when
        // the org membership is removed, so the audit before payload is the
        // only place it can be preserved.
        await prisma.projectMembership.create({
          data: {
            orgMembershipId: orgMembership.id,
            projectId: seededProjectId,
            userId: testUserId,
            role: "VIEWER",
          },
        });

        try {
          await makeAPICall(
            "DELETE",
            `/api/public/scim/Users/${testUserId}`,
            undefined,
            createBasicAuthHeader(orgApiKey, orgSecretKey),
          );
        } catch (_e) {
          // ignore
        }

        // The cascaded project membership is gone from the DB...
        const remainingProjectMemberships =
          await prisma.projectMembership.findMany({
            where: { userId: testUserId },
          });
        expect(remainingProjectMemberships.length).toBe(0);

        // ...but recoverable from the delete audit before payload.
        const auditLog = await prisma.auditLog.findFirst({
          where: {
            resourceType: "orgMembership",
            resourceId: orgMembership.id,
            action: "delete",
            orgId: orgId,
          },
        });
        expect(auditLog).not.toBeNull();
        expect(auditLog!.before).toContain("ProjectMemberships");
        expect(auditLog!.before).toContain(seededProjectId);
      });

      it("should return 404 when user does not exist", async () => {
        const nonExistentUserId = randomUUID();
        const result = await makeAPICall(
          "DELETE",
          `/api/public/scim/Users/${nonExistentUserId}`,
          undefined,
          createBasicAuthHeader(orgApiKey, orgSecretKey),
        );
        expect(result.status).toBe(404);
        expect(result.body.detail).toContain("User not found");
      });
    });

    describe("PATCH /api/public/scim/Users/{id}", () => {
      const patchAuth = () => createBasicAuthHeader(orgApiKey, orgSecretKey);
      const provisionOp = {
        schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
        Operations: [{ op: "replace", value: { active: true } }],
      };
      const deprovisionOp = {
        schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
        Operations: [{ op: "replace", value: { active: false } }],
      };

      beforeEach(async () => {
        const uniqueEmail = `test.user.${randomUUID().substring(0, 8)}@example.com`;
        const user = await prisma.user.create({
          data: { email: uniqueEmail, name: "Test User" },
        });
        await prisma.organizationMembership.create({
          data: { userId: user.id, orgId: orgId, role: "NONE" },
        });
        testUserId = user.id;
      });

      it("should not modify an existing member's role on PATCH active:true (no-op, no audit)", async () => {
        await prisma.organizationMembership.updateMany({
          where: { userId: testUserId, orgId: orgId },
          data: { role: "MEMBER" },
        });
        const before = await prisma.organizationMembership.findFirst({
          where: { userId: testUserId, orgId: orgId },
        });

        const result = await makeAPICall(
          "PATCH",
          `/api/public/scim/Users/${testUserId}`,
          provisionOp,
          patchAuth(),
        );
        expect(result.status).toBe(200);

        const after = await prisma.organizationMembership.findMany({
          where: { userId: testUserId, orgId: orgId },
        });
        expect(after.length).toBe(1);
        expect(after[0].role).toBe("MEMBER");

        const auditLogs = await prisma.auditLog.findMany({
          where: {
            resourceType: "orgMembership",
            resourceId: before!.id,
            orgId: orgId,
          },
        });
        expect(auditLogs.length).toBe(0);
      });

      it("should write a create audit log when PATCH active:true provisions a missing membership", async () => {
        await prisma.organizationMembership.deleteMany({
          where: { userId: testUserId, orgId: orgId },
        });

        const result = await makeAPICall(
          "PATCH",
          `/api/public/scim/Users/${testUserId}`,
          provisionOp,
          patchAuth(),
        );
        expect(result.status).toBe(200);

        const membership = await prisma.organizationMembership.findFirst({
          where: { userId: testUserId, orgId: orgId },
        });
        expect(membership).not.toBeNull();
        expect(membership!.role).toBe("NONE");

        const auditLogs = await prisma.auditLog.findMany({
          where: {
            resourceType: "orgMembership",
            resourceId: membership!.id,
            action: "create",
            orgId: orgId,
          },
        });
        expect(auditLogs.length).toBe(1);
        expect(auditLogs[0].apiKeyId).not.toBeNull();
      });

      it("should write a delete audit log when PATCH active:false deprovisions a membership", async () => {
        const before = await prisma.organizationMembership.findFirst({
          where: { userId: testUserId, orgId: orgId },
        });
        expect(before).not.toBeNull();

        const result = await makeAPICall(
          "PATCH",
          `/api/public/scim/Users/${testUserId}`,
          deprovisionOp,
          patchAuth(),
        );
        // PATCH ends by delegating to handleGet, so after a successful
        // deprovision the user is no longer a member and the endpoint responds
        // 404. The deprovision (and its audit log) still happened — asserted
        // below. (PUT active:false returns 200 instead; this PATCH quirk is
        // pre-existing and out of scope here.)
        expect(result.status).toBe(404);

        const remaining = await prisma.organizationMembership.findMany({
          where: { userId: testUserId, orgId: orgId },
        });
        expect(remaining.length).toBe(0);

        const auditLogs = await prisma.auditLog.findMany({
          where: {
            resourceType: "orgMembership",
            resourceId: before!.id,
            action: "delete",
            orgId: orgId,
          },
        });
        expect(auditLogs.length).toBe(1);
        expect(auditLogs[0].before).toContain(before!.id);
      });
    });

    describe("Last OWNER protection", () => {
      // Each scenario needs a fresh organization with exactly one OWNER so we
      // can exercise the guard without interfering with the seeded OWNER on
      // `seed-org-id`.
      let scopedOrgId: string;
      let scopedOwnerUserId: string;
      let scopedOrgPublicKey: string;
      let scopedOrgSecretKey: string;

      beforeEach(async () => {
        const org = await prisma.organization.create({
          data: {
            name: `scim-last-owner-${randomUUID().substring(0, 8)}`,
            // Team plan carries the `admin-api` entitlement that gates SCIM, so
            // these requests reach the last-OWNER guard rather than the plan
            // check.
            cloudConfig: { plan: "Team" },
          },
        });
        scopedOrgId = org.id;

        const owner = await prisma.user.create({
          data: {
            email: `owner.${randomUUID().substring(0, 8)}@example.com`,
            name: "Sole Owner",
          },
        });
        scopedOwnerUserId = owner.id;
        await prisma.organizationMembership.create({
          data: { userId: owner.id, orgId: scopedOrgId, role: "OWNER" },
        });

        scopedOrgPublicKey = `pk-lf-org-${randomUUID().substring(0, 8)}`;
        scopedOrgSecretKey = `sk-lf-org-${randomUUID().substring(0, 8)}`;
        await createAndAddApiKeysToDb({
          prisma,
          entityId: scopedOrgId,
          scope: "ORGANIZATION",
          predefinedKeys: {
            publicKey: scopedOrgPublicKey,
            secretKey: scopedOrgSecretKey,
          },
        });
      });

      afterEach(async () => {
        await prisma.user.deleteMany({ where: { id: scopedOwnerUserId } });
        await prisma.organization.deleteMany({ where: { id: scopedOrgId } });
      });

      it("DELETE rejects removing the only remaining OWNER", async () => {
        const result = await makeAPICall(
          "DELETE",
          `/api/public/scim/Users/${scopedOwnerUserId}`,
          undefined,
          createBasicAuthHeader(scopedOrgPublicKey, scopedOrgSecretKey),
        );

        expect(result.status).toBe(403);
        expect(String(result.body.detail).toLowerCase()).toContain(
          "last owner",
        );

        const remaining = await prisma.organizationMembership.findMany({
          where: { userId: scopedOwnerUserId, orgId: scopedOrgId },
        });
        expect(remaining.length).toBe(1);
        expect(remaining[0].role).toBe("OWNER");
      });

      it("PUT active:false rejects removing the only remaining OWNER", async () => {
        const result = await makeAPICall(
          "PUT",
          `/api/public/scim/Users/${scopedOwnerUserId}`,
          {
            schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
            id: scopedOwnerUserId,
            userName: "owner@example.com",
            active: false,
          },
          createBasicAuthHeader(scopedOrgPublicKey, scopedOrgSecretKey),
        );

        expect(result.status).toBe(403);
        expect(String(result.body.detail).toLowerCase()).toContain(
          "last owner",
        );

        const remaining = await prisma.organizationMembership.findMany({
          where: { userId: scopedOwnerUserId, orgId: scopedOrgId },
        });
        expect(remaining.length).toBe(1);
        expect(remaining[0].role).toBe("OWNER");
      });

      it("PATCH active:false rejects removing the only remaining OWNER", async () => {
        const result = await makeAPICall(
          "PATCH",
          `/api/public/scim/Users/${scopedOwnerUserId}`,
          {
            schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
            Operations: [{ op: "replace", value: { active: false } }],
          },
          createBasicAuthHeader(scopedOrgPublicKey, scopedOrgSecretKey),
        );

        expect(result.status).toBe(403);
        expect(String(result.body.detail).toLowerCase()).toContain(
          "last owner",
        );

        const remaining = await prisma.organizationMembership.findMany({
          where: { userId: scopedOwnerUserId, orgId: scopedOrgId },
        });
        expect(remaining.length).toBe(1);
        expect(remaining[0].role).toBe("OWNER");
      });

      it("PUT active:true with a lower role rejects demoting the only remaining OWNER", async () => {
        const result = await makeAPICall(
          "PUT",
          `/api/public/scim/Users/${scopedOwnerUserId}`,
          {
            schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
            id: scopedOwnerUserId,
            userName: "owner@example.com",
            active: true,
            roles: ["MEMBER"],
          },
          createBasicAuthHeader(scopedOrgPublicKey, scopedOrgSecretKey),
        );

        expect(result.status).toBe(403);
        expect(String(result.body.detail).toLowerCase()).toContain(
          "last owner",
        );

        const remaining = await prisma.organizationMembership.findMany({
          where: { userId: scopedOwnerUserId, orgId: scopedOrgId },
        });
        expect(remaining.length).toBe(1);
        expect(remaining[0].role).toBe("OWNER");
      });

      it("PUT active:true with a lower role allows demoting an OWNER when another OWNER remains", async () => {
        const secondOwner = await prisma.user.create({
          data: {
            email: `owner2.${randomUUID().substring(0, 8)}@example.com`,
            name: "Second Owner",
          },
        });
        await prisma.organizationMembership.create({
          data: {
            userId: secondOwner.id,
            orgId: scopedOrgId,
            role: "OWNER",
          },
        });

        try {
          const result = await makeAPICall(
            "PUT",
            `/api/public/scim/Users/${scopedOwnerUserId}`,
            {
              schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
              id: scopedOwnerUserId,
              userName: "owner@example.com",
              active: true,
              roles: ["MEMBER"],
            },
            createBasicAuthHeader(scopedOrgPublicKey, scopedOrgSecretKey),
          );
          expect(result.status).toBe(200);

          const demoted = await prisma.organizationMembership.findFirst({
            where: { userId: scopedOwnerUserId, orgId: scopedOrgId },
          });
          expect(demoted?.role).toBe("MEMBER");
        } finally {
          await prisma.organizationMembership.deleteMany({
            where: { userId: secondOwner.id, orgId: scopedOrgId },
          });
          await prisma.user.deleteMany({ where: { id: secondOwner.id } });
        }
      });

      it("DELETE allows removing an OWNER when another OWNER remains", async () => {
        const secondOwner = await prisma.user.create({
          data: {
            email: `owner2.${randomUUID().substring(0, 8)}@example.com`,
            name: "Second Owner",
          },
        });
        await prisma.organizationMembership.create({
          data: {
            userId: secondOwner.id,
            orgId: scopedOrgId,
            role: "OWNER",
          },
        });

        try {
          const result = await makeAPICall(
            "DELETE",
            `/api/public/scim/Users/${secondOwner.id}`,
            undefined,
            createBasicAuthHeader(scopedOrgPublicKey, scopedOrgSecretKey),
          );
          expect(result.status).toBe(204);

          const memberships = await prisma.organizationMembership.findMany({
            where: { userId: secondOwner.id, orgId: scopedOrgId },
          });
          expect(memberships.length).toBe(0);
        } finally {
          await prisma.user.deleteMany({ where: { id: secondOwner.id } });
        }
      });
    });
  });

  // SCIM provisioning is gated behind the `admin-api` entitlement, matching the
  // sibling organization admin REST endpoints (memberships, projects, apiKeys).
  // Plans without that entitlement (e.g. Hobby) must be rejected before any
  // user account is created or any membership is mutated.
  describe("Entitlement gating (admin-api)", () => {
    const PLAN_DETAIL = "This feature is not available on your current plan.";

    let hobbyOrgId: string;
    let hobbyPublicKey: string;
    let hobbySecretKey: string;

    let teamOrgId: string;
    let teamPublicKey: string;
    let teamSecretKey: string;

    beforeAll(async () => {
      // Hobby has no `admin-api` entitlement → SCIM must be blocked.
      const hobbyOrg = await prisma.organization.create({
        data: {
          name: `scim-gate-hobby-${randomUUID().substring(0, 8)}`,
          cloudConfig: { plan: "Hobby" },
        },
      });
      hobbyOrgId = hobbyOrg.id;
      hobbyPublicKey = `pk-lf-org-${randomUUID().substring(0, 8)}`;
      hobbySecretKey = `sk-lf-org-${randomUUID().substring(0, 8)}`;
      await createAndAddApiKeysToDb({
        prisma,
        entityId: hobbyOrgId,
        scope: "ORGANIZATION",
        predefinedKeys: {
          publicKey: hobbyPublicKey,
          secretKey: hobbySecretKey,
        },
      });

      // Team carries `admin-api` → positive control that the gate does not
      // over-block entitled plans.
      const teamOrg = await prisma.organization.create({
        data: {
          name: `scim-gate-team-${randomUUID().substring(0, 8)}`,
          cloudConfig: { plan: "Team" },
        },
      });
      teamOrgId = teamOrg.id;
      teamPublicKey = `pk-lf-org-${randomUUID().substring(0, 8)}`;
      teamSecretKey = `sk-lf-org-${randomUUID().substring(0, 8)}`;
      await createAndAddApiKeysToDb({
        prisma,
        entityId: teamOrgId,
        scope: "ORGANIZATION",
        predefinedKeys: {
          publicKey: teamPublicKey,
          secretKey: teamSecretKey,
        },
      });
    });

    afterAll(async () => {
      await prisma.organization.deleteMany({
        where: { id: { in: [hobbyOrgId, teamOrgId] } },
      });
    });

    it("POST /Users is rejected on a plan without admin-api and creates no account", async () => {
      const uniqueEmail = `scim.gate.${randomUUID().substring(0, 8)}@example.com`;
      const result = await makeAPICall(
        "POST",
        "/api/public/scim/Users",
        {
          schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
          userName: uniqueEmail,
          name: { formatted: "Backdoor" },
          password: "Backdoor2026!",
          roles: ["OWNER"],
          active: true,
        },
        createBasicAuthHeader(hobbyPublicKey, hobbySecretKey),
      );

      expect(result.status).toBe(403);
      expect(result.body.detail).toBe(PLAN_DETAIL);

      // The blocked request must not have created the user account.
      const user = await prisma.user.findUnique({
        where: { email: uniqueEmail.toLowerCase() },
      });
      expect(user).toBeNull();
    });

    it("GET /Users is rejected on a plan without admin-api", async () => {
      const result = await makeAPICall(
        "GET",
        "/api/public/scim/Users",
        undefined,
        createBasicAuthHeader(hobbyPublicKey, hobbySecretKey),
      );

      expect(result.status).toBe(403);
      expect(result.body.detail).toBe(PLAN_DETAIL);
    });

    it("PUT /Users/{id} is rejected on a plan without admin-api (before user lookup)", async () => {
      const result = await makeAPICall(
        "PUT",
        `/api/public/scim/Users/${randomUUID()}`,
        {
          schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
          userName: "someone@example.com",
          active: true,
          roles: ["OWNER"],
        },
        createBasicAuthHeader(hobbyPublicKey, hobbySecretKey),
      );

      expect(result.status).toBe(403);
      expect(result.body.detail).toBe(PLAN_DETAIL);
    });

    it("DELETE /Users/{id} is rejected on a plan without admin-api", async () => {
      const result = await makeAPICall(
        "DELETE",
        `/api/public/scim/Users/${randomUUID()}`,
        undefined,
        createBasicAuthHeader(hobbyPublicKey, hobbySecretKey),
      );

      expect(result.status).toBe(403);
      expect(result.body.detail).toBe(PLAN_DETAIL);
    });

    it("POST /Users still succeeds on a plan with admin-api", async () => {
      const uniqueEmail = `scim.gate.ok.${randomUUID().substring(0, 8)}@example.com`;
      const result = await makeAPICall(
        "POST",
        "/api/public/scim/Users",
        {
          schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
          userName: uniqueEmail,
          name: { formatted: "Allowed User" },
          active: true,
        },
        createBasicAuthHeader(teamPublicKey, teamSecretKey),
      );

      expect(result.status).toBe(201);
      expect(result.body.userName).toBe(uniqueEmail);

      // Cleanup the account created by the positive-control request.
      await prisma.user.deleteMany({
        where: { email: uniqueEmail.toLowerCase() },
      });
    });
  });
});
