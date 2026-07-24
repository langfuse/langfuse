import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import { makeAPICall } from "@/src/__tests__/test-utils";
import { env } from "@/src/env.mjs";

// The internal verify endpoint only exists when the shared secret is
// configured (LANGFUSE_INTERNAL_API_SECRET). The dev/CI env for this test
// process matches the running server's env, so branch on it.
const secret = env.LANGFUSE_INTERNAL_API_SECRET;
const whenConfigured = secret ? describe : describe.skip;
const whenNotConfigured = secret ? describe.skip : describe;

type VerifyResponse = {
  validKey: boolean;
  error?: string;
  scope?: {
    projectId: string | null;
    accessLevel: string;
    orgId: string;
    plan: string;
    apiKeyId: string;
  };
};

const verify = (auth?: string, headers?: Record<string, string>) =>
  makeAPICall<VerifyResponse>(
    "POST",
    "/api/internal/verify-api-key?allowInAppAgentKey=true",
    undefined,
    auth,
    headers,
  );

describe("/api/internal/verify-api-key", () => {
  whenConfigured("with LANGFUSE_INTERNAL_API_SECRET configured", () => {
    it("verifies valid credentials and returns the auth scope", async () => {
      const { auth, projectId } = await createOrgProjectAndApiKey();

      const { status, body } = await verify(auth, {
        "x-langfuse-internal-secret": secret!,
      });

      expect(status).toBe(200);
      expect(body.validKey).toBe(true);
      expect(body.scope?.projectId).toBe(projectId);
      expect(body.scope?.accessLevel).toBe("project");
    });

    it("returns validKey=false for invalid credentials", async () => {
      const { status, body } = await verify(
        "Basic " +
          Buffer.from("pk-lf-does-not-exist:sk-lf-does-not-exist").toString(
            "base64",
          ),
        { "x-langfuse-internal-secret": secret! },
      );

      expect(status).toBe(200);
      expect(body.validKey).toBe(false);
      expect(body.error).toContain("Invalid credentials");
    });

    it("rejects requests without the internal secret", async () => {
      const { auth } = await createOrgProjectAndApiKey();
      const { status } = await verify(auth);
      expect(status).toBe(401);
    });

    it("rejects requests with a wrong internal secret", async () => {
      const { auth } = await createOrgProjectAndApiKey();
      const { status } = await verify(auth, {
        "x-langfuse-internal-secret": "wrong-secret",
      });
      expect(status).toBe(401);
    });

    it("rejects non-POST methods", async () => {
      const { auth } = await createOrgProjectAndApiKey();
      const { status } = await makeAPICall(
        "GET",
        "/api/internal/verify-api-key",
        undefined,
        auth,
        { "x-langfuse-internal-secret": secret! },
      );
      expect(status).toBe(405);
    });
  });

  whenNotConfigured("without LANGFUSE_INTERNAL_API_SECRET", () => {
    it("does not exist (404)", async () => {
      const { auth } = await createOrgProjectAndApiKey();
      const { status } = await verify(auth, {
        "x-langfuse-internal-secret": "anything",
      });
      expect(status).toBe(404);
    });
  });
});
