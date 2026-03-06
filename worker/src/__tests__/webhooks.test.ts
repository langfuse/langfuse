import {
  describe,
  it,
  expect,
  beforeEach,
  beforeAll,
  afterAll,
  afterEach,
} from "vitest";
import { v4 } from "uuid";
import {
  ActionExecutionStatus,
  JobConfigState,
  PromptDomainSchema,
  WebhookActionConfigWithSecrets,
} from "@langfuse/shared";
import {
  WebhookInput,
  createOrgProjectAndApiKey,
  getActionByIdWithSecrets,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import {
  decrypt,
  encrypt,
  generateWebhookSignature,
} from "@langfuse/shared/encryption";
import { generateWebhookSecret } from "@langfuse/shared/encryption";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { executeWebhook } from "../queues/webhooks";

// Mock webhook server for testing HTTP requests
class WebhookTestServer {
  private server;
  private receivedRequests: Array<{
    url: string;
    method: string;
    headers: Record<string, string>;
    body: string;
  }> = [];

  constructor() {
    this.server = setupServer(
      // Default success response
      http.post("https://webhook.example.com/*", async ({ request }) => {
        this.receivedRequests.push({
          url: request.url,
          method: request.method,
          headers: Object.fromEntries(request.headers.entries()),
          body: JSON.stringify(await request.json()),
        });
        return HttpResponse.json({ success: true }, { status: 200 });
      }),

      // Error response endpoint
      http.post("https://webhook-error.example.com/*", async ({ request }) => {
        this.receivedRequests.push({
          url: request.url,
          method: request.method,
          headers: Object.fromEntries(request.headers.entries()),
          body: JSON.stringify(await request.json()),
        });
        return HttpResponse.json(
          { error: "Internal Server Error" },
          { status: 500 },
        );
      }),

      // 201 Created response endpoint (GitLab use case)
      http.post("https://webhook-201.example.com/*", async ({ request }) => {
        this.receivedRequests.push({
          url: request.url,
          method: request.method,
          headers: Object.fromEntries(request.headers.entries()),
          body: JSON.stringify(await request.json()),
        });
        return HttpResponse.json({ success: true }, { status: 201 });
      }),

      // Timeout endpoint
      http.post("https://webhook-timeout.example.com/*", () => {
        return HttpResponse.error();
      }),
    );
  }

  setup() {
    this.server.listen();
  }

  reset() {
    this.receivedRequests = [];
    this.server.resetHandlers();
  }

  teardown() {
    this.server.close();
  }

  getReceivedRequests() {
    return this.receivedRequests;
  }

  getLastRequest() {
    return this.receivedRequests[this.receivedRequests.length - 1];
  }
}

const webhookServer = new WebhookTestServer();

describe("Webhook Integration Tests", () => {
  let projectId: string;
  let triggerId: string;
  let actionId: string;
  let automationId: string;
  let promptId: string;
  let executionId: string;

  beforeAll(() => {
    webhookServer.setup();
  });

  beforeEach(async () => {
    webhookServer.reset();

    // Create test project
    ({ projectId } = await createOrgProjectAndApiKey());

    // Create test prompt
    promptId = v4();
    await prisma.prompt.create({
      data: {
        id: promptId,
        projectId,
        name: "test-prompt",
        version: 1,
        type: "text",
        prompt: { text: "Hello {{name}}" },
        createdBy: "test-user",
      },
    });

    // Create test trigger
    triggerId = v4();
    await prisma.trigger.create({
      data: {
        id: triggerId,
        projectId,
        eventSource: "prompt-version",
        eventActions: ["created"],
        filter: [],
        status: JobConfigState.ACTIVE,
      },
    });

    // Create test action
    actionId = v4();
    const { secretKey, displaySecretKey } = generateWebhookSecret();
    await prisma.action.create({
      data: {
        id: actionId,
        projectId,
        type: "WEBHOOK",
        config: {
          type: "WEBHOOK",
          url: "https://webhook.example.com/test",
          headers: {
            "X-Custom-Header-2": "test-value-2",
            "X-Custom-Header": "test-value",
          },
          apiVersion: { prompt: "v1" },
          secretKey: encrypt(secretKey),
          displaySecretKey,
        },
      },
    });

    // Link trigger to action
    automationId = v4();
    await prisma.automation.create({
      data: {
        id: automationId,
        projectId,
        triggerId,
        actionId,
        name: "Test Automation",
      },
    });
    executionId = v4();
  });

  afterEach(() => {
    webhookServer.reset();
  });

  afterAll(() => {
    webhookServer.teardown();
  });

  describe("executeWebhook function", () => {
    it("should execute webhook successfully with signature", async () => {
      // Get the full prompt for the payload
      const fullPrompt = await prisma.prompt.findUnique({
        where: { id: promptId },
      });

      const webhookInput: WebhookInput = {
        projectId,
        automationId,
        executionId,
        payload: {
          prompt: PromptDomainSchema.parse(fullPrompt),
          action: "created",
          type: "prompt-version",
        },
      };

      await prisma.automationExecution.create({
        data: {
          id: executionId,
          projectId,
          triggerId,
          automationId,
          actionId,
          status: ActionExecutionStatus.PENDING,
          sourceId: webhookInput.executionId,
          input: webhookInput,
        },
      });

      await executeWebhook(webhookInput, { skipValidation: true });

      // Verify webhook request was made
      const requests = webhookServer.getReceivedRequests();
      expect(requests).toHaveLength(1);

      const request = requests[0];
      expect(request.url).toBe("https://webhook.example.com/test");
      expect(request.method).toBe("POST");
      expect(request.headers["x-custom-header-2"]).toBe("test-value-2");
      expect(request.headers["x-custom-header"]).toBe("test-value");

      expect(request.headers["x-langfuse-signature"]).toMatch(
        /^t=\d+,v1=[a-f0-9]+$/,
      );

      // check signature
      const signature = request.headers["x-langfuse-signature"];
      const payload = JSON.parse(request.body);

      const action = await prisma.action.findUnique({
        where: { id: actionId },
      });

      const secretKey = (action?.config as WebhookActionConfigWithSecrets)
        ?.secretKey;

      if (!secretKey) {
        throw new Error("Action has no secret key");
      }

      const decryptedSecret = decrypt(secretKey);

      // Extract timestamp from the actual signature to avoid timing issues
      const timestampMatch = signature.match(/^t=(\d+),v1=/);
      if (!timestampMatch) {
        throw new Error("Invalid signature format");
      }
      const timestamp = parseInt(timestampMatch[1]);

      // Generate expected signature using the same timestamp
      const expectedSignatureHash = generateWebhookSignature(
        JSON.stringify(payload),
        timestamp,
        decryptedSecret,
      );
      const expectedSignature = `t=${timestamp},v1=${expectedSignatureHash}`;

      expect(signature).toBe(expectedSignature);

      expect(payload.id).toBe(webhookInput.executionId);
      expect(payload.type).toBe("prompt-version");
      expect(payload.action).toBe("created");
      expect(payload.prompt.name).toBe("test-prompt");
      expect(payload.prompt.version).toBe(1);
      expect(payload.prompt.createdBy).toBe("test-user");
      expect(payload.timestamp).toBeDefined();
      expect(payload.prompt.createdAt).toBeDefined();
      expect(payload.prompt.updatedAt).toBeDefined();

      // Verify prompt is the last field in the payload
      const payloadKeys = Object.keys(payload);
      expect(payloadKeys[payloadKeys.length - 1]).toBe("prompt");

      // Verify database execution record was updated
      const execution = await prisma.automationExecution.findUnique({
        where: { id: executionId },
      });
      expect(execution?.status).toBe(ActionExecutionStatus.COMPLETED);
      expect(execution?.output).toBeNull();
      expect(execution?.startedAt).toBeDefined();
      expect(execution?.finishedAt).toBeDefined();
    });

    it("should fail webhook execution if secret key does not exist and retry the bull job", async () => {
      const fullPrompt = await prisma.prompt.findUnique({
        where: { id: promptId },
      });

      const executionId = v4();

      await prisma.action.update({
        where: { id: actionId },
        data: {
          config: {
            type: "WEBHOOK",
            url: "https://webhook-error.example.com/test",
            headers: { "Content-Type": "application/json" },
            apiVersion: { prompt: "v1" },
            secretKey: null, // Explicitly set secret to null
          },
        },
      });

      await prisma.automationExecution.create({
        data: {
          id: executionId,
          projectId,
          triggerId,
          automationId,
          actionId,
          status: ActionExecutionStatus.PENDING,
          sourceId: v4(),
          input: {
            promptName: "test-prompt",
            promptVersion: 1,
            action: "created",
            type: "prompt-version",
          },
        },
      });

      const webhookInput: WebhookInput = {
        projectId,
        automationId,
        executionId,
        payload: {
          prompt: PromptDomainSchema.parse(fullPrompt),
          action: "created",
          type: "prompt-version",
        },
      };

      await expect(
        executeWebhook(webhookInput, { skipValidation: true }),
      ).rejects.toThrow("Action config is not a valid webhook configuration");

      const execution = await prisma.automationExecution.findUnique({
        where: { id: executionId },
      });

      expect(execution?.status).toBe(ActionExecutionStatus.PENDING);
    });

    it("should accept 201 status code as success (GitLab use case)", async () => {
      // Get the full prompt for the payload
      const fullPrompt = await prisma.prompt.findUnique({
        where: { id: promptId },
      });

      const action = await prisma.action.findUnique({
        where: { id: actionId },
      });

      if (!action) {
        throw new Error("Action not found");
      }

      // Update action to use 201 endpoint
      await prisma.action.update({
        where: { id: actionId },
        data: {
          projectId,
          type: "WEBHOOK",
          config: {
            ...(action.config as WebhookActionConfigWithSecrets),
            url: "https://webhook-201.example.com/test",
          },
        },
      });

      await prisma.automationExecution.create({
        data: {
          id: executionId,
          projectId,
          triggerId,
          automationId,
          actionId,
          status: ActionExecutionStatus.PENDING,
          sourceId: v4(),
          input: {
            promptName: "test-prompt",
            promptVersion: 1,
            action: "created",
            type: "prompt-version",
          },
        },
      });

      const webhookInput: WebhookInput = {
        projectId,
        automationId,
        executionId,
        payload: {
          prompt: PromptDomainSchema.parse(fullPrompt),
          action: "created",
          type: "prompt-version",
        },
      };

      await executeWebhook(webhookInput, { skipValidation: true });

      // Verify webhook request was made
      const requests = webhookServer.getReceivedRequests();
      expect(requests).toHaveLength(1);

      const request = requests[0];
      expect(request.url).toBe("https://webhook-201.example.com/test");
      expect(request.method).toBe("POST");

      // Verify execution was marked as completed (not error)
      const execution = await prisma.automationExecution.findUnique({
        where: { id: executionId },
      });
      expect(execution?.status).toBe(ActionExecutionStatus.COMPLETED);
      expect(execution?.startedAt).toBeDefined();
      expect(execution?.finishedAt).toBeDefined();
    });

    it("should handle webhook endpoint returning error", async () => {
      const fullPrompt = await prisma.prompt.findUnique({
        where: { id: promptId },
      });

      const action = await prisma.action.findUnique({
        where: { id: actionId },
      });

      if (!action) {
        throw new Error("Action not found");
      }

      await prisma.action.update({
        where: { id: actionId },
        data: {
          projectId,
          type: "WEBHOOK",
          config: {
            ...(action.config as WebhookActionConfigWithSecrets),
            url: "https://webhook-error.example.com/test",
          },
        },
      });

      await prisma.automationExecution.create({
        data: {
          id: executionId,
          projectId,
          triggerId,
          automationId,
          actionId,
          status: ActionExecutionStatus.PENDING,
          sourceId: v4(),
          input: {
            promptName: "test-prompt",
            promptVersion: 1,
            action: "created",
            type: "prompt-version",
          },
        },
      });
      // Create action pointing to error endpoint
      const webhookInput: WebhookInput = {
        projectId,
        automationId,
        executionId,
        payload: {
          prompt: PromptDomainSchema.parse(fullPrompt),
          action: "created",
          type: "prompt-version",
        },
      };

      await executeWebhook(webhookInput, { skipValidation: true });

      // Verify execution was marked as error
      const execution = await prisma.automationExecution.findUnique({
        where: { id: executionId },
      });
      expect(execution?.status).toBe(ActionExecutionStatus.ERROR);
      expect(execution?.error).toContain(
        `Webhook does not return 2xx status: failed with status 500 for url https://webhook-error.example.com/test and project ${projectId}`,
      );
      expect(execution?.output).toMatchObject({
        httpStatus: 500,
        responseBody: '{"error":"Internal Server Error"}',
      });
    });

    it("should disable trigger after 5 consecutive failures and store lastFailingExecutionId", async () => {
      const fullPrompt = await prisma.prompt.findUnique({
        where: { id: promptId },
      });

      const action = await prisma.action.findUnique({
        where: { id: actionId },
      });

      if (!action) {
        throw new Error("Action not found");
      }

      await prisma.action.update({
        where: { id: actionId },
        data: {
          projectId,
          type: "WEBHOOK",
          config: {
            ...(action.config as WebhookActionConfigWithSecrets),
            url: "https://webhook-error.example.com/test",
          },
        },
      });

      // Execute webhook 5 times to trigger consecutive failures
      for (let i = 0; i < 5; i++) {
        const executionId = v4();

        await prisma.automationExecution.create({
          data: {
            id: executionId,
            projectId,
            triggerId,
            automationId,
            actionId,
            status: ActionExecutionStatus.PENDING,
            sourceId: v4(),
            input: {
              promptName: "test-prompt",
              promptVersion: 1,
              action: "created",
              type: "prompt-version",
            },
          },
        });

        const webhookInput: WebhookInput = {
          projectId,
          automationId,
          executionId,
          payload: {
            prompt: PromptDomainSchema.parse(fullPrompt),
            action: "created",
            type: "prompt-version",
          },
        };

        await executeWebhook(webhookInput, { skipValidation: true });

        // Verify execution was marked as error
        const execution = await prisma.automationExecution.findUnique({
          where: { id: executionId },
        });

        expect(execution?.status).toBe(ActionExecutionStatus.ERROR);
        expect(execution?.error).toContain(
          `Webhook does not return 2xx status: failed with status 500 for url https://webhook-error.example.com/test and project ${projectId}`,
        );
      }

      // Verify trigger was disabled after 5 consecutive failures
      const trigger = await prisma.trigger.findUnique({
        where: { id: triggerId },
      });
      expect(trigger?.status).toBe(JobConfigState.INACTIVE);

      // Verify lastFailingExecutionId was stored in action config
      const updatedAction = await prisma.action.findUnique({
        where: { id: actionId },
      });
      const config = updatedAction?.config as any;
      expect(config.lastFailingExecutionId).toBeDefined();
      expect(typeof config.lastFailingExecutionId).toBe("string");
    });

    it("should execute webhook with secret headers correctly", async () => {
      // Get the full prompt for the payload
      const fullPrompt = await prisma.prompt.findUnique({
        where: { id: promptId },
      });

      // Update action config to include both public and secret headers
      const action = await prisma.action.findUnique({
        where: { id: actionId },
      });

      if (!action) {
        throw new Error("Action not found");
      }

      const updatedConfig = {
        ...(action.config as WebhookActionConfigWithSecrets),
        requestHeaders: {
          "x-public-header": { secret: false, value: "public-value" },
          "x-secret-api-key": {
            secret: true,
            value: encrypt("secret-api-key-value"),
          },
          "x-secret-token": {
            secret: true,
            value: encrypt("bearer-token-value"),
          },
        },
        displayHeaders: {
          "x-secret-api-key": { secret: true, value: "secr...alue" },
          "x-secret-token": { secret: true, value: "bear...alue" },
        },
      };

      await prisma.action.update({
        where: { id: actionId },
        data: {
          config: updatedConfig,
        },
      });

      const webhookInput: WebhookInput = {
        projectId,
        automationId,
        executionId,
        payload: {
          prompt: PromptDomainSchema.parse(fullPrompt),
          action: "created",
          type: "prompt-version",
        },
      };

      await prisma.automationExecution.create({
        data: {
          id: executionId,
          projectId,
          triggerId,
          automationId,
          actionId,
          status: ActionExecutionStatus.PENDING,
          sourceId: webhookInput.executionId,
          input: webhookInput,
        },
      });

      await executeWebhook(webhookInput, { skipValidation: true });

      // Verify webhook request was made with decrypted secret headers
      const requests = webhookServer.getReceivedRequests();
      expect(requests).toHaveLength(1);

      const request = requests[0];
      expect(request.url).toBe("https://webhook.example.com/test");
      expect(request.method).toBe("POST");

      // Verify public header is present
      expect(request.headers["x-public-header"]).toBe("public-value");

      // Verify secret headers are present and decrypted
      expect(request.headers["x-secret-api-key"]).toBe("secret-api-key-value");
      expect(request.headers["x-secret-token"]).toBe("bearer-token-value");

      // Verify signature is present
      expect(request.headers["x-langfuse-signature"]).toMatch(
        /^t=\d+,v1=[a-f0-9]+$/,
      );

      // Verify database execution record was updated
      const execution = await prisma.automationExecution.findUnique({
        where: { id: executionId },
      });
      expect(execution?.status).toBe(ActionExecutionStatus.COMPLETED);
    });

    it("should handle webhook with only secret headers", async () => {
      // Get the full prompt for the payload
      const fullPrompt = await prisma.prompt.findUnique({
        where: { id: promptId },
      });

      // Update action config to include only secret headers
      const action = await prisma.action.findUnique({
        where: { id: actionId },
      });

      if (!action) {
        throw new Error("Action not found");
      }

      const updatedConfig = {
        ...(action.config as WebhookActionConfigWithSecrets),
        requestHeaders: {
          authorization: {
            secret: true,
            value: encrypt("Bearer secret-token-12345"),
          },
          "x-api-key": { secret: true, value: encrypt("api-key-67890") },
        },
        displayHeaders: {
          authorization: { secret: true, value: "Bear***12345" },
          "x-api-key": { secret: true, value: "api-***67890" },
        },
      };

      await prisma.action.update({
        where: { id: actionId },
        data: {
          config: updatedConfig,
        },
      });

      const newExecutionId = v4();
      const webhookInput: WebhookInput = {
        projectId,
        automationId,
        executionId: newExecutionId,
        payload: {
          prompt: PromptDomainSchema.parse(fullPrompt),
          action: "created",
          type: "prompt-version",
        },
      };

      await prisma.automationExecution.create({
        data: {
          id: newExecutionId,
          projectId,
          triggerId,
          automationId,
          actionId,
          status: ActionExecutionStatus.PENDING,
          sourceId: webhookInput.executionId,
          input: webhookInput,
        },
      });

      await executeWebhook(webhookInput, { skipValidation: true });

      // Verify webhook request was made with decrypted secret headers
      const requests = webhookServer.getReceivedRequests();
      expect(requests).toHaveLength(1); // This test only

      const request = requests[0]; // Get the request
      expect(request.url).toBe("https://webhook.example.com/test");

      // Verify secret headers are present and decrypted
      expect(request.headers["authorization"]).toBe(
        "Bearer secret-token-12345",
      );
      expect(request.headers["x-api-key"]).toBe("api-key-67890");

      // Verify database execution record was updated
      const execution = await prisma.automationExecution.findUnique({
        where: { id: newExecutionId },
      });
      expect(execution?.status).toBe(ActionExecutionStatus.COMPLETED);
    });

    it("should handle webhook with only legacy public headers", async () => {
      // Get the full prompt for the payload
      const fullPrompt = await prisma.prompt.findUnique({
        where: { id: promptId },
      });

      // Update action config to include only public headers
      const action = await prisma.action.findUnique({
        where: { id: actionId },
      });

      if (!action) {
        throw new Error("Action not found");
      }

      const updatedConfig = {
        ...(action.config as WebhookActionConfigWithSecrets),
        headers: {
          "x-public-header-1": "public-value-1",
          "x-public-header-2": "public-value-2",
        },
        secretHeaderKeys: [], // No secret headers
        displayHeaders: {},
      };

      await prisma.action.update({
        where: { id: actionId },
        data: {
          config: updatedConfig,
        },
      });

      const newExecutionId = v4();
      const webhookInput: WebhookInput = {
        projectId,
        automationId,
        executionId: newExecutionId,
        payload: {
          prompt: PromptDomainSchema.parse(fullPrompt),
          action: "created",
          type: "prompt-version",
        },
      };

      await prisma.automationExecution.create({
        data: {
          id: newExecutionId,
          projectId,
          triggerId,
          automationId,
          actionId,
          status: ActionExecutionStatus.PENDING,
          sourceId: webhookInput.executionId,
          input: webhookInput,
        },
      });

      await executeWebhook(webhookInput, { skipValidation: true });

      // Verify webhook request was made with public headers
      const requests = webhookServer.getReceivedRequests();
      expect(requests).toHaveLength(1); // This test only

      const request = requests[0]; // Get the request
      expect(request.url).toBe("https://webhook.example.com/test");

      // Verify public headers are present
      expect(request.headers["x-public-header-1"]).toBe("public-value-1");
      expect(request.headers["x-public-header-2"]).toBe("public-value-2");

      // Verify database execution record was updated
      const execution = await prisma.automationExecution.findUnique({
        where: { id: newExecutionId },
      });
      expect(execution?.status).toBe(ActionExecutionStatus.COMPLETED);
    });

    it("should handle webhook with legacy public headers + new public and secret headers", async () => {
      // Get the full prompt for the payload
      const fullPrompt = await prisma.prompt.findUnique({
        where: { id: promptId },
      });

      // Update action config to include only public headers
      const action = await prisma.action.findUnique({
        where: { id: actionId },
      });

      if (!action) {
        throw new Error("Action not found");
      }

      const updatedConfig = {
        ...(action.config as WebhookActionConfigWithSecrets),
        headers: {
          "x-public-header-1": "public-value-1",
          "x-public-header-2": "public-value-2",
        },
        requestHeaders: {
          "x-public-header-3": { secret: false, value: "public-value-3" },
          "x-secret-header-4": {
            secret: true,
            value: encrypt("secret-value-4"),
          },
          "x-public-header-1": { secret: false, value: "public-value-5" },
        },
        displayHeaders: {},
      };

      await prisma.action.update({
        where: { id: actionId },
        data: {
          config: updatedConfig,
        },
      });

      const newExecutionId = v4();
      const webhookInput: WebhookInput = {
        projectId,
        automationId,
        executionId: newExecutionId,
        payload: {
          prompt: PromptDomainSchema.parse(fullPrompt),
          action: "created",
          type: "prompt-version",
        },
      };

      await prisma.automationExecution.create({
        data: {
          id: newExecutionId,
          projectId,
          triggerId,
          automationId,
          actionId,
          status: ActionExecutionStatus.PENDING,
          sourceId: webhookInput.executionId,
          input: webhookInput,
        },
      });

      await executeWebhook(webhookInput, { skipValidation: true });

      // Verify webhook request was made with public headers
      const requests = webhookServer.getReceivedRequests();
      expect(requests).toHaveLength(1); // This test only

      const request = requests[0]; // Get the request
      expect(request.url).toBe("https://webhook.example.com/test");

      // Verify public headers are present
      expect(request.headers["x-public-header-1"]).toBe("public-value-5");
      expect(request.headers["x-public-header-2"]).toBe("public-value-2");
      expect(request.headers["x-public-header-3"]).toBe("public-value-3");
      expect(request.headers["x-secret-header-4"]).toBe("secret-value-4");

      // Verify database execution record was updated
      const execution = await prisma.automationExecution.findUnique({
        where: { id: newExecutionId },
      });
      expect(execution?.status).toBe(ActionExecutionStatus.COMPLETED);
    });

    it("should handle decryption failure gracefully", async () => {
      // Get the full prompt for the payload
      const fullPrompt = await prisma.prompt.findUnique({
        where: { id: promptId },
      });

      // Update action config with invalid encrypted header
      const action = await prisma.action.findUnique({
        where: { id: actionId },
      });

      if (!action) {
        throw new Error("Action not found");
      }

      const updatedConfig = {
        ...(action.config as WebhookActionConfigWithSecrets),
        requestHeaders: {
          "x-valid-header": { secret: false, value: "valid-public-value" },
          "x-invalid-secret": {
            secret: true,
            value: "invalid-encrypted-value", // This is not properly encrypted
          },
        },
        displayHeaders: {
          "x-invalid-secret": { secret: true, value: "inva...alue" },
        },
      };

      await prisma.action.update({
        where: { id: actionId },
        data: {
          config: updatedConfig,
        },
      });

      const newExecutionId = v4();
      const webhookInput: WebhookInput = {
        projectId,
        automationId,
        executionId: newExecutionId,
        payload: {
          prompt: PromptDomainSchema.parse(fullPrompt),
          action: "created",
          type: "prompt-version",
        },
      };

      await prisma.automationExecution.create({
        data: {
          id: newExecutionId,
          projectId,
          triggerId,
          automationId,
          actionId,
          status: ActionExecutionStatus.PENDING,
          sourceId: webhookInput.executionId,
          input: webhookInput,
        },
      });

      await executeWebhook(webhookInput, { skipValidation: true });

      // Verify webhook request was made with valid headers only
      const requests = webhookServer.getReceivedRequests();
      expect(requests).toHaveLength(1); // This test only

      const request = requests[0]; // Get the request
      expect(request.url).toBe("https://webhook.example.com/test");

      // Verify valid header is present
      expect(request.headers["x-valid-header"]).toBe("valid-public-value");

      // Verify invalid secret header is not present (skipped due to decryption failure)
      expect(request.headers["x-invalid-secret"]).toBeUndefined();

      // Verify database execution record was updated (should still succeed)
      const execution = await prisma.automationExecution.findUnique({
        where: { id: newExecutionId },
      });
      expect(execution?.status).toBe(ActionExecutionStatus.COMPLETED);
    });

    it("should handle missing automation gracefully without throwing error", async () => {
      const fullPrompt = await prisma.prompt.findUnique({
        where: { id: promptId },
      });

      const executionId = v4();
      const nonExistentAutomationId = v4(); // Use a random ID that doesn't exist

      const webhookInput: WebhookInput = {
        projectId,
        automationId: nonExistentAutomationId,
        executionId,
        payload: {
          prompt: PromptDomainSchema.parse(fullPrompt),
          action: "created",
          type: "prompt-version",
        },
      };

      // Should not throw an error, but return gracefully
      await expect(
        executeWebhook(webhookInput, { skipValidation: true }),
      ).resolves.toBeUndefined();

      // Verify that no execution record was created since automation doesn't exist
      const execution = await prisma.automationExecution.findUnique({
        where: { id: executionId },
      });
      expect(execution).toBeNull();
    });

    it("should reset failure count correctly with lastFailingExecutionId", async () => {
      const fullPrompt = await prisma.prompt.findUnique({
        where: { id: promptId },
      });

      const action = await prisma.action.findUnique({
        where: { id: actionId },
      });

      if (!action) {
        throw new Error("Action not found");
      }

      // Set a lastFailingExecutionId in the action config
      const lastFailingExecutionId = v4();
      await prisma.action.update({
        where: { id: actionId },
        data: {
          config: {
            ...(action.config as WebhookActionConfigWithSecrets),
            lastFailingExecutionId,
          },
        },
      });

      // Create the execution that matches the lastFailingExecutionId
      await prisma.automationExecution.create({
        data: {
          id: lastFailingExecutionId,
          projectId,
          triggerId,
          automationId,
          actionId,
          status: ActionExecutionStatus.ERROR,
          sourceId: v4(),
          input: { test: "old failing execution" },
          error: "Old failure",
          createdAt: new Date(Date.now() - 60000), // 1 minute ago
        },
      });

      // Import the function to test it directly
      const { getConsecutiveAutomationFailures } = await import(
        "@langfuse/shared/src/server"
      );

      // Check that consecutive failures is 0 since there are no executions after the lastFailingExecutionId
      const failures = await getConsecutiveAutomationFailures({
        automationId,
        projectId,
      });

      expect(failures).toBe(0);
    });

    it(
      "should reset failure count when webhook is re-enabled after being disabled",
      { timeout: 20000 },
      async () => {
        const fullPrompt = await prisma.prompt.findUnique({
          where: { id: promptId },
        });

        const action = await getActionByIdWithSecrets({
          projectId,
          actionId,
        });

        if (!action) {
          throw new Error("Action not found");
        }

        // Update action to point to error endpoint
        await prisma.action.update({
          where: { id: actionId },
          data: {
            config: {
              ...(action.config as WebhookActionConfigWithSecrets),
              url: "https://webhook-error.example.com/test",
            },
          },
        });

        const executionIds: string[] = [];

        // Execute webhook 5 times to trigger disable
        for (let i = 0; i < 5; i++) {
          const executionId = v4();
          executionIds.push(executionId);

          await prisma.automationExecution.create({
            data: {
              id: executionId,
              projectId,
              triggerId,
              automationId,
              actionId,
              status: ActionExecutionStatus.PENDING,
              sourceId: v4(),
              input: {
                promptName: "test-prompt",
                promptVersion: 1,
                action: "created",
                type: "prompt-version",
              },
            },
          });

          const webhookInput: WebhookInput = {
            projectId,
            automationId,
            executionId,
            payload: {
              prompt: PromptDomainSchema.parse(fullPrompt),
              action: "created",
              type: "prompt-version",
            },
          };

          await executeWebhook(webhookInput, { skipValidation: true });
        }

        // Verify trigger was disabled and lastFailingExecutionId was stored
        const trigger = await prisma.trigger.findUnique({
          where: { id: triggerId },
        });
        expect(trigger?.status).toBe(JobConfigState.INACTIVE);

        const actionAfterDisable = await prisma.action.findUnique({
          where: { id: actionId },
        });
        const configAfterDisable = actionAfterDisable?.config as any;
        expect(configAfterDisable.lastFailingExecutionId).toBe(executionIds[4]);

        // Re-enable the trigger (simulates user action)
        await prisma.trigger.update({
          where: { id: triggerId },
          data: { status: JobConfigState.ACTIVE },
        });

        // Create 5 more failing executions to trigger disable again
        const newExecutionIds: string[] = [];
        for (let i = 0; i < 5; i++) {
          const newExecutionId = v4();
          newExecutionIds.push(newExecutionId);

          await prisma.automationExecution.create({
            data: {
              id: newExecutionId,
              projectId,
              triggerId,
              automationId,
              actionId,
              status: ActionExecutionStatus.PENDING,
              sourceId: v4(),
              input: {
                promptName: "test-prompt",
                promptVersion: 1,
                action: "created",
                type: "prompt-version",
              },
            },
          });

          const newWebhookInput: WebhookInput = {
            projectId,
            automationId,
            executionId: newExecutionId,
            payload: {
              prompt: PromptDomainSchema.parse(fullPrompt),
              action: "created",
              type: "prompt-version",
            },
          };

          await executeWebhook(newWebhookInput, { skipValidation: true });
        }

        // Verify trigger was disabled again and lastFailingExecutionId was updated
        const triggerAfterSecondDisable = await prisma.trigger.findUnique({
          where: { id: triggerId },
        });
        expect(triggerAfterSecondDisable?.status).toBe(JobConfigState.INACTIVE);

        const actionAfterSecondDisable = await prisma.action.findUnique({
          where: { id: actionId },
        });
        const configAfterSecondDisable =
          actionAfterSecondDisable?.config as any;
        expect(configAfterSecondDisable.lastFailingExecutionId).toBe(
          newExecutionIds[4],
        );
      },
    );

    it("should include user info in webhook payload when provided", async () => {
      const fullPrompt = await prisma.prompt.findUnique({
        where: { id: promptId },
      });

      const testUser = {
        id: "user-123",
        name: "Test User",
        email: "test@example.com",
      };

      const webhookInput: WebhookInput = {
        projectId,
        automationId,
        executionId,
        payload: {
          prompt: PromptDomainSchema.parse(fullPrompt),
          action: "created",
          type: "prompt-version",
          user: testUser,
        },
      };

      await prisma.automationExecution.create({
        data: {
          id: executionId,
          projectId,
          triggerId,
          automationId,
          actionId,
          status: ActionExecutionStatus.PENDING,
          sourceId: webhookInput.executionId,
          input: webhookInput,
        },
      });

      await executeWebhook(webhookInput, { skipValidation: true });

      const requests = webhookServer.getReceivedRequests();
      expect(requests).toHaveLength(1);

      const payload = JSON.parse(requests[0].body);
      expect(payload.user).toEqual({
        name: testUser.name,
        email: testUser.email,
      });
      expect(payload.user.id).toBeUndefined();
      // Verify prompt is still the last field
      const payloadKeys = Object.keys(payload);
      expect(payloadKeys[payloadKeys.length - 1]).toBe("prompt");
    });

    it("should omit user field from webhook payload when not provided", async () => {
      const fullPrompt = await prisma.prompt.findUnique({
        where: { id: promptId },
      });

      const webhookInput: WebhookInput = {
        projectId,
        automationId,
        executionId,
        payload: {
          prompt: PromptDomainSchema.parse(fullPrompt),
          action: "created",
          type: "prompt-version",
        },
      };

      await prisma.automationExecution.create({
        data: {
          id: executionId,
          projectId,
          triggerId,
          automationId,
          actionId,
          status: ActionExecutionStatus.PENDING,
          sourceId: webhookInput.executionId,
          input: webhookInput,
        },
      });

      await executeWebhook(webhookInput, { skipValidation: true });

      const requests = webhookServer.getReceivedRequests();
      expect(requests).toHaveLength(1);

      const payload = JSON.parse(requests[0].body);
      expect(payload.user).toBeUndefined();
    });

    it("should include user info in GitHub dispatch payload when provided", async () => {
      const fullPrompt = await prisma.prompt.findUnique({
        where: { id: promptId },
      });

      const testUser = {
        id: "user-456",
        name: "GitHub User",
        email: "github@example.com",
      };

      // Create a GitHub dispatch action
      const ghActionId = v4();
      await prisma.action.create({
        data: {
          id: ghActionId,
          projectId,
          type: "GITHUB_DISPATCH",
          config: {
            type: "GITHUB_DISPATCH",
            url: "https://webhook.example.com/dispatches",
            eventType: "prompt-update",
            githubToken: encrypt("ghp_test_token"),
            displayGitHubToken: "ghp_...n",
          },
        },
      });

      // Create automation linking trigger and GitHub dispatch action
      const ghAutomationId = v4();
      await prisma.automation.create({
        data: {
          id: ghAutomationId,
          projectId,
          triggerId,
          actionId: ghActionId,
          name: "GitHub Dispatch Automation",
        },
      });

      const ghExecutionId = v4();
      await prisma.automationExecution.create({
        data: {
          id: ghExecutionId,
          projectId,
          triggerId,
          automationId: ghAutomationId,
          actionId: ghActionId,
          status: ActionExecutionStatus.PENDING,
          sourceId: promptId,
          input: {},
        },
      });

      const webhookInput: WebhookInput = {
        projectId,
        automationId: ghAutomationId,
        executionId: ghExecutionId,
        payload: {
          prompt: PromptDomainSchema.parse(fullPrompt),
          action: "created",
          type: "prompt-version",
          user: testUser,
        },
      };

      await executeWebhook(webhookInput, { skipValidation: true });

      const requests = webhookServer.getReceivedRequests();
      expect(requests).toHaveLength(1);

      const payload = JSON.parse(requests[0].body);
      expect(payload.event_type).toBe("prompt-update");
      expect(payload.client_payload.user).toEqual({
        name: testUser.name,
        email: testUser.email,
      });
      expect(payload.client_payload.user.id).toBeUndefined();
      // Verify prompt is still the last field in client_payload
      const clientPayloadKeys = Object.keys(payload.client_payload);
      expect(clientPayloadKeys[clientPayloadKeys.length - 1]).toBe("prompt");
    });
  });
});
