import { type NextApiRequest } from "next";
import { verifyAuth } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { prisma } from "@langfuse/shared/src/db";
import { env } from "@/src/env.mjs";
import {
  createOrgProjectAndApiKey,
  hashSecretKey,
  getDisplaySecretKey,
} from "@langfuse/shared/src/server";

describe("Admin API Key Authentication", () => {
  const ADMIN_API_KEY = "test-admin-key-123";

  // Store original env value to restore after tests
  const originalAdminApiKey = env.ADMIN_API_KEY;
  const originalCloudRegion = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;

  let projectId: string;
  let orgId: string;
  let auth: string;

  beforeAll(() => {
    // Set up env for admin API key tests
    (env as any).ADMIN_API_KEY = ADMIN_API_KEY;
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;
  });

  afterAll(() => {
    // Restore original env values
    (env as any).ADMIN_API_KEY = originalAdminApiKey;
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalCloudRegion;
  });

  beforeEach(async () => {
    // Create a new project and API key for each test
    const result = await createOrgProjectAndApiKey();
    projectId = result.projectId;
    orgId = result.orgId;
    auth = result.auth;
  });

  describe("Basic Auth (isAdminApiKeyAuthAllowed = false)", () => {
    it("should successfully authenticate with valid basic auth", async () => {
      // auth from beforeEach contains a valid API key
      const mockReq = {
        headers: {
          authorization: auth,
        },
      } as NextApiRequest;

      const result = await verifyAuth(mockReq, false);

      expect(result.validKey).toBe(true);
      expect(result.scope.projectId).toBe(projectId);
      expect(result.scope.accessLevel).toBe("project");
    });

    it("should throw error when basic auth fails", async () => {
      const mockReq = {
        headers: {
          authorization: "Basic invalid",
        },
      } as NextApiRequest;

      await expect(verifyAuth(mockReq, false)).rejects.toEqual({
        status: 401,
        message: expect.stringContaining(""),
      });
    });

    it("should throw error when projectId is missing", async () => {
      // Create an org-level key (generate unique values to avoid conflicts)
      const timestamp = Date.now();
      const uniqueId = `org-api-key-${timestamp}`;
      const publicKey = `pk-org-key-${timestamp}`;
      const secretKey = `sk-org-key-${timestamp}`;

      await prisma.apiKey.create({
        data: {
          id: uniqueId,
          publicKey,
          hashedSecretKey: await hashSecretKey(secretKey),
          displaySecretKey: getDisplaySecretKey(secretKey),
          note: "org key",
          organization: {
            connect: { id: orgId },
          },
        },
      });

      const mockReq = {
        headers: {
          authorization:
            "Basic " +
            Buffer.from(`${publicKey}:${secretKey}`).toString("base64"),
        },
      } as NextApiRequest;

      await expect(verifyAuth(mockReq, false)).rejects.toMatchObject({
        status: 401,
        message: expect.stringContaining(""),
      });
    });
  });

  describe("Admin API Key Auth (isAdminApiKeyAuthAllowed = true)", () => {
    it("should successfully authenticate with valid admin API key", async () => {
      const mockReq = {
        headers: {
          authorization: `Bearer ${ADMIN_API_KEY}`,
          "x-langfuse-admin-api-key": ADMIN_API_KEY,
          "x-langfuse-project-id": projectId,
        },
      } as NextApiRequest;

      const result = await verifyAuth(mockReq, true);

      expect(result.validKey).toBe(true);
      expect(result.scope.projectId).toBe(projectId);
      expect(result.scope.orgId).toBe(orgId);
      expect(result.scope.apiKeyId).toBe("ADMIN_API_KEY");
      expect(result.scope.publicKey).toBe("ADMIN_API_KEY");
      expect(result.scope.accessLevel).toBe("project");
    });

    it("should fall back to basic auth when no Bearer header", async () => {
      const mockReq = {
        headers: {
          authorization: auth,
        },
      } as NextApiRequest;

      const result = await verifyAuth(mockReq, true);

      expect(result.validKey).toBe(true);
      expect(result.scope.projectId).toBe(projectId);
      expect(result.scope.apiKeyId).not.toBe("ADMIN_API_KEY");
    });

    it("should fall back to basic auth when no x-langfuse-admin-api-key header", async () => {
      const mockReq = {
        headers: {
          authorization: auth,
        },
      } as NextApiRequest;

      const result = await verifyAuth(mockReq, true);

      expect(result.validKey).toBe(true);
      expect(result.scope.projectId).toBe(projectId);
    });

    it("should fail on Langfuse Cloud", async () => {
      (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "prod-us";

      const mockReq = {
        headers: {
          authorization: `Bearer ${ADMIN_API_KEY}`,
          "x-langfuse-admin-api-key": ADMIN_API_KEY,
          "x-langfuse-project-id": projectId,
        },
      } as NextApiRequest;

      await expect(verifyAuth(mockReq, true)).rejects.toEqual({
        status: 403,
        message: "Admin API key auth is not available on Langfuse Cloud",
      });

      (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;
    });

    it("should fail when ADMIN_API_KEY is not configured", async () => {
      (env as any).ADMIN_API_KEY = undefined;

      const mockReq = {
        headers: {
          authorization: "Bearer some-key",
          "x-langfuse-admin-api-key": "some-key",
          "x-langfuse-project-id": projectId,
        },
      } as NextApiRequest;

      await expect(verifyAuth(mockReq, true)).rejects.toEqual({
        status: 500,
        message: "Admin API key is not configured on this instance",
      });

      (env as any).ADMIN_API_KEY = ADMIN_API_KEY;
    });

    it("should fail with invalid Bearer token", async () => {
      const mockReq = {
        headers: {
          authorization: "Bearer wrong-key",
          "x-langfuse-admin-api-key": ADMIN_API_KEY,
          "x-langfuse-project-id": projectId,
        },
      } as NextApiRequest;

      await expect(verifyAuth(mockReq, true)).rejects.toEqual({
        status: 401,
        message: "Invalid admin API key",
      });
    });

    it("should fail with invalid x-langfuse-admin-api-key header", async () => {
      const mockReq = {
        headers: {
          authorization: `Bearer ${ADMIN_API_KEY}`,
          "x-langfuse-admin-api-key": "wrong-key",
          "x-langfuse-project-id": projectId,
        },
      } as NextApiRequest;

      await expect(verifyAuth(mockReq, true)).rejects.toEqual({
        status: 401,
        message: "Invalid admin API key",
      });
    });

    it("should fail when both admin key headers don't match ADMIN_API_KEY", async () => {
      const mockReq = {
        headers: {
          authorization: "Bearer different-key-1",
          "x-langfuse-admin-api-key": "different-key-2",
          "x-langfuse-project-id": projectId,
        },
      } as NextApiRequest;

      await expect(verifyAuth(mockReq, true)).rejects.toEqual({
        status: 401,
        message: "Invalid admin API key",
      });
    });

    it("should fail without x-langfuse-project-id header", async () => {
      const mockReq = {
        headers: {
          authorization: `Bearer ${ADMIN_API_KEY}`,
          "x-langfuse-admin-api-key": ADMIN_API_KEY,
        },
      } as NextApiRequest;

      await expect(verifyAuth(mockReq, true)).rejects.toEqual({
        status: 400,
        message:
          "x-langfuse-project-id header is required for admin API key authentication",
      });
    });

    it("should fail with non-existent project", async () => {
      const mockReq = {
        headers: {
          authorization: `Bearer ${ADMIN_API_KEY}`,
          "x-langfuse-admin-api-key": ADMIN_API_KEY,
          "x-langfuse-project-id": "non-existent-project",
        },
      } as NextApiRequest;

      await expect(verifyAuth(mockReq, true)).rejects.toEqual({
        status: 404,
        message: "Project not found",
      });
    });

    it("should fall back to basic auth successfully after admin auth not attempted", async () => {
      const mockReq = {
        headers: {
          authorization: auth,
          "x-langfuse-project-id": projectId,
        },
      } as NextApiRequest;

      const result = await verifyAuth(mockReq, true);

      expect(result.validKey).toBe(true);
      expect(result.scope.projectId).toBe(projectId);
      expect(result.scope.apiKeyId).not.toBe("ADMIN_API_KEY");
    });
  });
});
