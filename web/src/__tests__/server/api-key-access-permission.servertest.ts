import { makeAPICall } from "@/src/__tests__/test-utils";
import {
  createOrgProjectAndApiKey,
  hashSecretKey,
  getDisplaySecretKey,
  createBasicAuthHeader,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { v4 as uuidv4 } from "uuid";

describe("API Key Access Permission", () => {
  describe("READ_ONLY key behavior", () => {
    let readOnlyAuth: string;

    beforeEach(async () => {
      const setup = await createOrgProjectAndApiKey({
        accessPermission: "READ_ONLY",
      });
      readOnlyAuth = setup.auth;
    });

    it("should allow GET requests (200)", async () => {
      const result = await makeAPICall(
        "GET",
        "/api/public/traces",
        undefined,
        readOnlyAuth,
      );
      expect(result.status).toBe(200);
    });

    it("should block non-GET requests with 403 and read-only message", async () => {
      const result = await makeAPICall(
        "POST",
        "/api/public/traces",
        {
          id: uuidv4(),
          name: "test-trace",
        },
        readOnlyAuth,
      );
      expect(result.status).toBe(403);
      expect((result.body as any).message).toBe(
        "This API key has read-only access",
      );
    });

    it("should block legacy prompt POST with 403", async () => {
      const result = await makeAPICall(
        "POST",
        "/api/public/prompts",
        {
          name: "test-prompt",
          prompt: "hello world",
          isActive: true,
        },
        readOnlyAuth,
      );
      expect(result.status).toBe(403);
      expect((result.body as any).message).toBe(
        "This API key has read-only access",
      );
    });

    it("should block ingestion POST with 403", async () => {
      const result = await makeAPICall(
        "POST",
        "/api/public/ingestion",
        {
          batch: [
            {
              id: uuidv4(),
              type: "trace-create",
              timestamp: new Date().toISOString(),
              body: {
                id: uuidv4(),
                name: "test-trace",
              },
            },
          ],
        },
        readOnlyAuth,
      );
      expect(result.status).toBe(403);
      expect((result.body as any).message).toBe(
        "This API key has read-only access",
      );
    });
  });

  describe("READ_AND_WRITE key behavior", () => {
    let readWriteAuth: string;

    beforeEach(async () => {
      const setup = await createOrgProjectAndApiKey({
        accessPermission: "READ_AND_WRITE",
      });
      readWriteAuth = setup.auth;
    });

    it("should allow POST requests (not 403)", async () => {
      const result = await makeAPICall(
        "POST",
        "/api/public/traces",
        {
          id: uuidv4(),
          name: "test-trace",
        },
        readWriteAuth,
      );
      // Should not be 403 (could be 200, 201, etc.)
      expect(result.status).not.toBe(403);
    });
  });

  describe("Cross-key interactions in the same project", () => {
    let readOnlyAuth: string;
    let readWriteAuth: string;
    let sharedProjectId: string;

    beforeEach(async () => {
      // Create the first key (read-write) and capture the projectId
      const rwSetup = await createOrgProjectAndApiKey({
        accessPermission: "READ_AND_WRITE",
      });
      readWriteAuth = rwSetup.auth;
      sharedProjectId = rwSetup.projectId;

      // Create a read-only key directly in the same project (no new org/project needed)
      const roPublicKey = uuidv4();
      const roSecretKey = uuidv4();
      await prisma.apiKey.create({
        data: {
          id: uuidv4(),
          projectId: sharedProjectId,
          publicKey: roPublicKey,
          hashedSecretKey: await hashSecretKey(roSecretKey),
          displaySecretKey: getDisplaySecretKey(roSecretKey),
          scope: "PROJECT",
          accessPermission: "READ_ONLY",
        },
      });
      readOnlyAuth = createBasicAuthHeader(roPublicKey, roSecretKey);
    });

    it("should allow read-only key to GET legacy prompts created by a read-write key", async () => {
      const promptName = `test-prompt-${uuidv4()}`;

      // Create a prompt using the read-write key
      const createResult = await makeAPICall(
        "POST",
        "/api/public/prompts",
        {
          name: promptName,
          prompt: "hello world",
          isActive: true,
        },
        readWriteAuth,
      );
      expect(createResult.status).toBe(201);

      // Read the prompt using the read-only key
      const getResult = await makeAPICall(
        "GET",
        `/api/public/prompts?name=${encodeURIComponent(promptName)}`,
        undefined,
        readOnlyAuth,
      );
      expect(getResult.status).toBe(200);
    });
  });
});
