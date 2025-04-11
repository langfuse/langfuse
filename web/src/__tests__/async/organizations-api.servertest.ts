/** @jest-environment node */

import {
  makeZodVerifiedAPICall,
  makeAPICall,
} from "@/src/__tests__/test-utils";
import { prisma } from "@langfuse/shared/src/db";
import { z } from "zod";
import { randomUUID } from "crypto";

// Schema for organization response
const OrganizationResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string().datetime(),
});

// Schema for multiple organizations response
const OrganizationsListSchema = z.array(OrganizationResponseSchema);

// Schema for delete response
const DeleteResponseSchema = z.object({
  success: z.boolean(),
});

describe("Admin Organizations API", () => {
  const ADMIN_API_KEY = process.env.ADMIN_API_KEY;

  describe("POST /api/admin/organizations", () => {
    it("should create a new organization with valid admin authentication", async () => {
      const uniqueOrgName = `Test Org ${randomUUID().substring(0, 8)}`;

      const response = await makeZodVerifiedAPICall(
        OrganizationResponseSchema,
        "POST",
        "/api/admin/organizations",
        {
          name: uniqueOrgName,
        },
        `Bearer ${ADMIN_API_KEY}`,
        201, // Expected status code is 201 Created
      );

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        name: uniqueOrgName,
      });
      expect(response.body.id).toBeDefined();
      expect(response.body.createdAt).toBeDefined();

      // Verify the organization was actually created in the database
      const org = await prisma.organization.findUnique({
        where: { id: response.body.id },
      });
      expect(org).not.toBeNull();
      expect(org?.name).toBe(uniqueOrgName);
    });

    it("should return 401 when no authorization header is provided", async () => {
      const uniqueOrgName = `Test Org ${randomUUID().substring(0, 8)}`;

      const result = await makeAPICall("POST", "/api/admin/organizations", {
        name: uniqueOrgName,
      });
      expect(result.status).toBe(401);
      expect(result.body.error).toContain("Unauthorized");
    });

    it("should return 401 when invalid admin API key is provided", async () => {
      const uniqueOrgName = `Test Org ${randomUUID().substring(0, 8)}`;

      const result = await makeAPICall(
        "POST",
        "/api/admin/organizations",
        {
          name: uniqueOrgName,
        },
        "Bearer invalid-admin-key",
      );
      expect(result.status).toBe(401);
      expect(result.body.error).toContain("Unauthorized");
    });

    it("should return 400 when organization name is too short", async () => {
      const result = await makeAPICall(
        "POST",
        "/api/admin/organizations",
        {
          name: "A", // Short name
        },
        `Bearer ${ADMIN_API_KEY}`,
      );
      expect(result.status).toBe(400);
      expect(result.body.error).toContain("Invalid request body");
    });

    it("should return 400 when organization name is too long", async () => {
      const result = await makeAPICall(
        "POST",
        "/api/admin/organizations",
        {
          name: "A".repeat(31), // More than 30 characters
        },
        `Bearer ${ADMIN_API_KEY}`,
      );
      expect(result.status).toBe(400);
      expect(result.body.error).toContain("Invalid request body");
    });
  });

  describe("GET /api/admin/organizations", () => {
    let testOrgId: string;

    beforeAll(async () => {
      // Create a test organization to retrieve
      const uniqueOrgName = `Test Org ${randomUUID().substring(0, 8)}`;
      const org = await prisma.organization.create({
        data: { name: uniqueOrgName },
      });
      testOrgId = org.id;
    });

    afterAll(async () => {
      // Clean up test organization
      await prisma.organization
        .delete({
          where: { id: testOrgId },
        })
        .catch(() => {
          /* ignore if already deleted */
        });
    });

    it("should get all organizations with valid admin authentication", async () => {
      const response = await makeZodVerifiedAPICall(
        OrganizationsListSchema,
        "GET",
        "/api/admin/organizations",
        undefined,
        `Bearer ${ADMIN_API_KEY}`,
        200,
      );

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      // Verify the test organization is in the list
      expect(response.body.some((org) => org.id === testOrgId)).toBe(true);
    });

    it("should return 401 when no authorization header is provided", async () => {
      const result = await makeAPICall("GET", "/api/admin/organizations");
      expect(result.status).toBe(401);
      expect(result.body.error).toContain("Unauthorized");
    });
  });

  describe("GET /api/admin/organizations/[organizationId]", () => {
    let testOrgId: string;

    beforeAll(async () => {
      // Create a test organization to retrieve
      const uniqueOrgName = `Test Org ${randomUUID().substring(0, 8)}`;
      const org = await prisma.organization.create({
        data: { name: uniqueOrgName },
      });
      testOrgId = org.id;
    });

    afterAll(async () => {
      // Clean up test organization
      await prisma.organization
        .delete({
          where: { id: testOrgId },
        })
        .catch(() => {
          /* ignore if already deleted */
        });
    });

    it("should get a specific organization by ID", async () => {
      const response = await makeZodVerifiedAPICall(
        OrganizationResponseSchema,
        "GET",
        `/api/admin/organizations/${testOrgId}`,
        undefined,
        `Bearer ${ADMIN_API_KEY}`,
        200,
      );

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(testOrgId);
    });

    it("should return 404 when getting a non-existent organization", async () => {
      const nonExistentId = randomUUID();
      const result = await makeAPICall(
        "GET",
        `/api/admin/organizations/${nonExistentId}`,
        undefined,
        `Bearer ${ADMIN_API_KEY}`,
      );

      expect(result.status).toBe(404);
      expect(result.body.error).toContain("Organization not found");
    });
  });

  describe("PUT /api/admin/organizations/[organizationId]", () => {
    let testOrgId: string;

    beforeEach(async () => {
      // Create a test organization to update
      const uniqueOrgName = `Test Org ${randomUUID().substring(0, 8)}`;
      const org = await prisma.organization.create({
        data: { name: uniqueOrgName },
      });
      testOrgId = org.id;
    });

    afterEach(async () => {
      // Clean up test organization
      await prisma.organization
        .delete({
          where: { id: testOrgId },
        })
        .catch(() => {
          /* ignore if already deleted */
        });
    });

    it("should update an organization with valid admin authentication", async () => {
      const newName = `Updated Org ${randomUUID().substring(0, 8)}`;

      const response = await makeZodVerifiedAPICall(
        OrganizationResponseSchema,
        "PUT",
        `/api/admin/organizations/${testOrgId}`,
        {
          name: newName,
        },
        `Bearer ${ADMIN_API_KEY}`,
        200,
      );

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: testOrgId,
        name: newName,
      });

      // Verify the organization was actually updated in the database
      const org = await prisma.organization.findUnique({
        where: { id: testOrgId },
      });
      expect(org).not.toBeNull();
      expect(org?.name).toBe(newName);
    });

    it("should return 404 when updating a non-existent organization", async () => {
      const nonExistentId = randomUUID();
      const result = await makeAPICall(
        "PUT",
        `/api/admin/organizations/${nonExistentId}`,
        {
          name: "New Name",
        },
        `Bearer ${ADMIN_API_KEY}`,
      );

      expect(result.status).toBe(404);
      expect(result.body.error).toContain("Organization not found");
    });

    it("should return 400 when updating with invalid name", async () => {
      const result = await makeAPICall(
        "PUT",
        `/api/admin/organizations/${testOrgId}`,
        {
          name: "A", // Short name
        },
        `Bearer ${ADMIN_API_KEY}`,
      );

      expect(result.status).toBe(400);
      expect(result.body.error).toContain("Invalid request body");
    });

    it("should return 401 when no authorization header is provided", async () => {
      const result = await makeAPICall(
        "PUT",
        `/api/admin/organizations/${testOrgId}`,
        {
          name: "New Name",
        },
      );

      expect(result.status).toBe(401);
      expect(result.body.error).toContain("Unauthorized");
    });
  });

  describe("DELETE /api/admin/organizations/[organizationId]", () => {
    let testOrgId: string;

    beforeEach(async () => {
      // Create a test organization to delete
      const uniqueOrgName = `Test Org ${randomUUID().substring(0, 8)}`;
      const org = await prisma.organization.create({
        data: { name: uniqueOrgName },
      });
      testOrgId = org.id;
    });

    afterEach(async () => {
      // Clean up test organization if not deleted by test
      await prisma.organization
        .delete({
          where: { id: testOrgId },
        })
        .catch(() => {
          /* ignore if already deleted */
        });
    });

    it("should delete an organization with valid admin authentication", async () => {
      // Create a test organization to delete
      const uniqueOrgName = `Test Org ${randomUUID().substring(0, 8)}`;
      const orgId = (
        await prisma.organization.create({
          data: { name: uniqueOrgName },
        })
      ).id;

      const response = await makeZodVerifiedAPICall(
        DeleteResponseSchema,
        "DELETE",
        `/api/admin/organizations/${orgId}`,
        undefined,
        `Bearer ${ADMIN_API_KEY}`,
        200,
      );

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
      });

      // Verify the organization was actually deleted from the database
      const org = await prisma.organization.findUnique({
        where: { id: orgId },
      });
      expect(org).toBeNull();
    });

    it("should return 404 when deleting a non-existent organization", async () => {
      const nonExistentId = randomUUID();
      const result = await makeAPICall(
        "DELETE",
        `/api/admin/organizations/${nonExistentId}`,
        undefined,
        `Bearer ${ADMIN_API_KEY}`,
      );

      expect(result.status).toBe(404);
      expect(result.body.error).toContain("Organization not found");
    });

    it("should return 400 when organization has projects", async () => {
      // Create a project for the test organization
      await prisma.project.create({
        data: {
          name: "Test Project",
          orgId: testOrgId,
        },
      });

      const result = await makeAPICall(
        "DELETE",
        `/api/admin/organizations/${testOrgId}`,
        undefined,
        `Bearer ${ADMIN_API_KEY}`,
      );

      expect(result.status).toBe(400);
      expect(result.body.error).toContain(
        "Cannot delete organization with existing projects",
      );

      // Clean up the project
      await prisma.project.deleteMany({
        where: { orgId: testOrgId },
      });
    });

    it("should return 401 when no authorization header is provided", async () => {
      const result = await makeAPICall(
        "DELETE",
        `/api/admin/organizations/${testOrgId}`,
      );

      expect(result.status).toBe(401);
      expect(result.body.error).toContain("Unauthorized");
    });
  });

  it("should return 405 for non-supported methods", async () => {
    const result = await makeAPICall(
      "PATCH",
      "/api/admin/organizations",
      undefined,
      `Bearer ${ADMIN_API_KEY}`,
    );
    expect(result.status).toBe(405);
    expect(result.body.error).toContain("Method Not Allowed");
  });
});
