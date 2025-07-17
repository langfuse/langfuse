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
  JsonNested,
  PromptDomainSchema,
  WebhookActionConfigWithSecrets,
} from "@langfuse/shared";
import {
  WebhookInput,
  createOrgProjectAndApiKey,
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
            "Content-Type": "application/json",
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

      await executeWebhook(webhookInput);

      // Verify webhook request was made
      const requests = webhookServer.getReceivedRequests();
      expect(requests).toHaveLength(1);

      const request = requests[0];
      expect(request.url).toBe("https://webhook.example.com/test");
      expect(request.method).toBe("POST");
      expect(request.headers["content-type"]).toBe("application/json");
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

      await expect(executeWebhook(webhookInput)).rejects.toThrow(
        "Webhook config has no secret key, failing webhook execution",
      );

      const execution = await prisma.automationExecution.findUnique({
        where: { id: executionId },
      });

      expect(execution?.status).toBe(ActionExecutionStatus.PENDING);
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

      await executeWebhook(webhookInput);

      // Verify execution was marked as error
      const execution = await prisma.automationExecution.findUnique({
        where: { id: executionId },
      });
      expect(execution?.status).toBe(ActionExecutionStatus.ERROR);
      expect(execution?.error).toContain(
        `Webhook does not return 200: failed with status 500 for url https://webhook-error.example.com/test and project ${projectId}`,
      );
      expect(execution?.output).toMatchObject({
        httpStatus: 500,
        responseBody: '{"error":"Internal Server Error"}',
      });
    });

    it("should disable trigger after 5 consecutive failures", async () => {
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

        await executeWebhook(webhookInput);

        // Verify execution was marked as error
        const execution = await prisma.automationExecution.findUnique({
          where: { id: executionId },
        });

        expect(execution?.status).toBe(ActionExecutionStatus.ERROR);
        expect(execution?.error).toContain(
          `Webhook does not return 200: failed with status 500 for url https://webhook-error.example.com/test and project ${projectId}`,
        );
      }

      // Verify trigger was disabled after 5 consecutive failures
      const trigger = await prisma.trigger.findUnique({
        where: { id: triggerId },
      });
      expect(trigger?.status).toBe(JobConfigState.INACTIVE);
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
      await expect(executeWebhook(webhookInput)).resolves.toBeUndefined();

      // Verify that no execution record was created since automation doesn't exist
      const execution = await prisma.automationExecution.findUnique({
        where: { id: executionId },
      });
      expect(execution).toBeNull();
    });
  });
});
