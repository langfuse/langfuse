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
  executeWebhook,
  redis,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import {
  createSignatureHeader,
  decrypt,
  encrypt,
} from "@langfuse/shared/encryption";
import { generateWebhookSecret } from "@langfuse/shared/encryption";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";

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
        eventSource: "prompt",
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
    await prisma.triggersOnActions.create({
      data: {
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
    redis?.disconnect();
  });

  describe("executeWebhook function", () => {
    it("should execute webhook successfully with signature", async () => {
      // Get the full prompt for the payload
      const fullPrompt = await prisma.prompt.findUnique({
        where: { id: promptId },
      });

      const webhookInput: WebhookInput = {
        eventId: v4(),
        projectId,
        actionId,
        triggerId,
        executionId,
        payload: {
          prompt: PromptDomainSchema.parse(fullPrompt),
          action: "created",
          type: "prompt",
        },
      };

      await prisma.actionExecution.create({
        data: {
          id: executionId,
          projectId,
          triggerId,
          actionId,
          status: ActionExecutionStatus.PENDING,
          sourceId: webhookInput.eventId,
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
      expect(request.headers["langfuse-signature"]).toMatch(
        /^t=\d+,v1=[a-f0-9]+$/,
      );

      // check signature
      const signature = request.headers["langfuse-signature"];
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
      const expectedSignature = createSignatureHeader(
        JSON.stringify(payload),
        decryptedSecret,
      );

      expect(signature).toBe(expectedSignature);

      expect(payload.id).toBe(webhookInput.eventId);
      expect(payload.type).toBe("prompt");
      expect(payload.action).toBe("created");
      expect(payload.prompt.name).toBe("test-prompt");
      expect(payload.prompt.version).toBe(1);
      expect(payload.timestamp).toBeDefined();
      expect(payload.prompt.createdAt).toBeDefined();
      expect(payload.prompt.updatedAt).toBeDefined();

      // Verify database execution record was updated
      const execution = await prisma.actionExecution.findUnique({
        where: { id: executionId },
      });
      expect(execution?.status).toBe(ActionExecutionStatus.COMPLETED);
      expect(execution?.output).toMatchObject({
        httpStatus: 200,
        responseBody: '{"success":true}',
      });
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

      await prisma.actionExecution.create({
        data: {
          id: executionId,
          projectId,
          triggerId,
          actionId,
          status: ActionExecutionStatus.PENDING,
          sourceId: v4(),
          input: {
            promptName: "test-prompt",
            promptVersion: 1,
            action: "created",
            type: "prompt",
          },
        },
      });

      const webhookInput: WebhookInput = {
        eventId: v4(),
        projectId,
        actionId,
        triggerId,
        executionId,
        payload: {
          prompt: PromptDomainSchema.parse(fullPrompt),
          action: "created",
          type: "prompt",
        },
      };

      await expect(executeWebhook(webhookInput)).rejects.toThrow(
        "Webhook config has no secret key, failing webhook execution",
      );

      const execution = await prisma.actionExecution.findUnique({
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

      await prisma.actionExecution.create({
        data: {
          id: executionId,
          projectId,
          triggerId,
          actionId,
          status: ActionExecutionStatus.PENDING,
          sourceId: v4(),
          input: {
            promptName: "test-prompt",
            promptVersion: 1,
            action: "created",
            type: "prompt",
          },
        },
      });
      // Create action pointing to error endpoint
      const webhookInput: WebhookInput = {
        eventId: v4(),
        projectId,
        actionId,
        triggerId,
        executionId,
        payload: {
          prompt: PromptDomainSchema.parse(fullPrompt),
          action: "created",
          type: "prompt",
        },
      };

      await executeWebhook(webhookInput);

      // Verify execution was marked as error
      const execution = await prisma.actionExecution.findUnique({
        where: { id: executionId },
      });
      expect(execution?.status).toBe(ActionExecutionStatus.ERROR);
      expect(execution?.error).toContain(
        `Webhook for project ${projectId} failed with status 500`,
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

        await prisma.actionExecution.create({
          data: {
            id: executionId,
            projectId,
            triggerId,
            actionId,
            status: ActionExecutionStatus.PENDING,
            sourceId: v4(),
            input: {
              promptName: "test-prompt",
              promptVersion: 1,
              action: "created",
              type: "prompt",
            },
          },
        });

        const webhookInput: WebhookInput = {
          eventId: v4(),
          projectId,
          actionId,
          triggerId,
          executionId,
          payload: {
            prompt: PromptDomainSchema.parse(fullPrompt),
            action: "created",
            type: "prompt",
          },
        };

        await executeWebhook(webhookInput);

        // Verify execution was marked as error
        const execution = await prisma.actionExecution.findUnique({
          where: { id: executionId },
        });
        expect(execution?.status).toBe(ActionExecutionStatus.ERROR);
        expect(execution?.error).toContain(
          `Webhook for project ${projectId} failed with status 500`,
        );
      }

      // Verify trigger was disabled after 5 consecutive failures
      const trigger = await prisma.trigger.findUnique({
        where: { id: triggerId },
      });
      expect(trigger?.status).toBe(JobConfigState.INACTIVE);
    });
  });
});
