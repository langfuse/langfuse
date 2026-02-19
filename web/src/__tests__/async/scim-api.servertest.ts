/** @jest-environment node */

import {
  makeZodVerifiedAPICall,
  makeAPICall,
} from "@/src/__tests__/test-utils";
import { z } from "zod/v4";
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
  });
});
