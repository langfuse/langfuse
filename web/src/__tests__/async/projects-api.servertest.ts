/** @jest-environment node */

import {
  makeZodVerifiedAPICall,
  makeAPICall,
} from "@/src/__tests__/test-utils";
import { z } from "zod";
import { createBasicAuthHeader } from "@langfuse/shared/src/server";

// Schema for project response
const ProjectResponseSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
    }),
  ),
});

describe("Public Projects API", () => {
  // Test variables
  const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";
  const projectName = "Seed Project";
  const projectApiKey = "pk-lf-1234567890";
  const projectSecretKey = "sk-lf-1234567890";
  const invalidApiKey = "pk-lf-invalid";
  const invalidSecretKey = "sk-lf-invalid";

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
        "POST",
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
});
