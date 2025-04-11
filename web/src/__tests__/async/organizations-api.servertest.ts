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

    it("should return 405 for non-POST methods", async () => {
      const result = await makeAPICall(
        "GET",
        "/api/admin/organizations",
        undefined,
        `Bearer ${ADMIN_API_KEY}`,
      );
      expect(result.status).toBe(405);
      expect(result.body.error).toContain("Method Not Allowed");
    });
  });
});
