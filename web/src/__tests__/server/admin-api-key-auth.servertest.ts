import { type NextApiRequest } from "next";
import {
  verifyAdminApiKeyAuth,
  verifyAuth,
} from "@/src/features/auth/policy/shadow.projects";
import { env } from "@/src/env.mjs";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";

describe("Admin API Key Authentication", () => {
  const ADMIN_API_KEY = "test-admin-key-123";

  const originalAdminApiKey = env.ADMIN_API_KEY;
  const originalCloudRegion = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;

  let projectId: string;
  let orgId: string;
  let auth: string;

  beforeAll(() => {
    (env as any).ADMIN_API_KEY = ADMIN_API_KEY;
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;
  });

  afterAll(() => {
    (env as any).ADMIN_API_KEY = originalAdminApiKey;
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalCloudRegion;
  });

  beforeEach(async () => {
    const result = await createOrgProjectAndApiKey();
    projectId = result.projectId;
    orgId = result.orgId;
    auth = result.auth;
  });

  const reqWith = (
    authorization: string,
    headers: Record<string, string> = {},
  ) =>
    ({
      headers: { authorization, ...headers },
    }) as unknown as NextApiRequest;

  describe("regular API key auth (no admin attempt)", () => {
    it("authenticates a valid basic key to its project scope", async () => {
      const result = await verifyAuth({
        req: reqWith(auth),
        name: "Test",
        action: null,
      });
      expect(result.validKey).toBe(true);
      expect(result.scope.projectId).toBe(projectId);
      expect(result.scope.accessLevel).toBe("project");
    });

    it("throws a 401 for invalid basic auth", async () => {
      await expect(
        verifyAuth({
          req: reqWith("Basic invalid"),
          name: "Test",
          action: null,
        }),
      ).rejects.toMatchObject({ status: 401 });
    });
  });

  describe("admin API key auth", () => {
    const adminReq = (headers: Record<string, string> = {}) =>
      reqWith(`Bearer ${ADMIN_API_KEY}`, {
        "x-langfuse-admin-api-key": ADMIN_API_KEY,
        "x-langfuse-project-id": projectId,
        ...headers,
      });

    it("resolves the target project scope for a valid admin key", async () => {
      const result = await verifyAdminApiKeyAuth(adminReq());
      expect(result?.validKey).toBe(true);
      expect(result?.scope.projectId).toBe(projectId);
      expect(result?.scope.orgId).toBe(orgId);
      expect(result?.scope.apiKeyId).toBe("ADMIN_API_KEY");
      expect(result?.scope.publicKey).toBe("ADMIN_API_KEY");
      expect(result?.scope.accessLevel).toBe("project");
    });

    it("returns null when no admin key headers are present", async () => {
      expect(await verifyAdminApiKeyAuth(reqWith(auth))).toBeNull();
    });

    it("fails on Langfuse Cloud", async () => {
      (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "prod-us";
      await expect(verifyAdminApiKeyAuth(adminReq())).rejects.toEqual({
        status: 403,
        message: "Admin API key auth is not available on Langfuse Cloud",
      });
      (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;
    });

    it("fails when ADMIN_API_KEY is not configured", async () => {
      (env as any).ADMIN_API_KEY = undefined;
      await expect(
        verifyAdminApiKeyAuth(
          reqWith("Bearer some-key", {
            "x-langfuse-admin-api-key": "some-key",
            "x-langfuse-project-id": projectId,
          }),
        ),
      ).rejects.toEqual({
        status: 500,
        message: "Admin API key is not configured on this instance",
      });
      (env as any).ADMIN_API_KEY = ADMIN_API_KEY;
    });

    it("fails with an invalid Bearer token", async () => {
      await expect(
        verifyAdminApiKeyAuth(
          reqWith("Bearer wrong-key", {
            "x-langfuse-admin-api-key": ADMIN_API_KEY,
            "x-langfuse-project-id": projectId,
          }),
        ),
      ).rejects.toEqual({ status: 401, message: "Invalid admin API key" });
    });

    it("fails with an invalid x-langfuse-admin-api-key header", async () => {
      await expect(
        verifyAdminApiKeyAuth(
          adminReq({ "x-langfuse-admin-api-key": "wrong" }),
        ),
      ).rejects.toEqual({ status: 401, message: "Invalid admin API key" });
    });

    it("fails without an x-langfuse-project-id header", async () => {
      const req = reqWith(`Bearer ${ADMIN_API_KEY}`, {
        "x-langfuse-admin-api-key": ADMIN_API_KEY,
      });
      await expect(verifyAdminApiKeyAuth(req)).rejects.toEqual({
        status: 400,
        message:
          "x-langfuse-project-id header is required for admin API key authentication",
      });
    });

    it("fails for a non-existent project", async () => {
      await expect(
        verifyAdminApiKeyAuth(
          adminReq({ "x-langfuse-project-id": "non-existent-project" }),
        ),
      ).rejects.toEqual({ status: 404, message: "Project not found" });
    });
  });
});
