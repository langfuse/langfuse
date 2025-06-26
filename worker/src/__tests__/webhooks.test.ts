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
  WebhookOutboundBaseSchema,
} from "@langfuse/shared";
import {
  WebhookInput,
  QueueName,
  TQueueJobTypes,
  createOrgProjectAndApiKey,
  executeWebhook,
} from "@langfuse/shared/src/server";
import { PromptWebhookOutboundSchema } from "@langfuse/shared";
import { Job } from "bullmq";
import { prisma } from "@langfuse/shared/src/db";
import { encrypt } from "@langfuse/shared/encryption";
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
      http.post("https://webhook.example.com/*", ({ request }) => {
        this.receivedRequests.push({
          url: request.url,
          method: request.method,
          headers: Object.fromEntries(request.headers.entries()),
          body: JSON.stringify(request.body),
        });
        return HttpResponse.json({ success: true }, { status: 200 });
      }),

      // Error response endpoint
      http.post("https://webhook-error.example.com/*", ({ request }) => {
        this.receivedRequests.push({
          url: request.url,
          method: request.method,
          headers: Object.fromEntries(request.headers.entries()),
          body: JSON.stringify(request.body),
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
  });

  describe("executeWebhook function", () => {
    it("should execute webhook successfully with signature", async () => {
      const webhookInput: WebhookInput = {
        eventId: v4(),
        projectId,
        actionId,
        triggerId,
        executionId,
        payload: {
          promptName: "test-prompt",
          promptVersion: 1,
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

      const payload = JSON.parse(request.body);
      const validatedPayload = PromptWebhookOutboundSchema.parse(payload);
      expect(validatedPayload.id).toBe(webhookInput.eventId);
      expect(validatedPayload.type).toBe("prompt");
      expect(validatedPayload.action).toBe("created");
      expect(validatedPayload.prompt.name).toBe("test-prompt");
      expect(validatedPayload.prompt.version).toBe(1);

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

    //   it("should execute webhook without secret key", async () => {
    //     // Create action without secret
    //     const actionWithoutSecret = v4();
    //     await prisma.action.create({
    //       data: {
    //         id: actionWithoutSecret,
    //         projectId,
    //         name: "Action Without Secret",
    //         type: "WEBHOOK",
    //         config: {
    //           type: "WEBHOOK",
    //           url: "https://webhook.example.com/no-secret",
    //           headers: { "Content-Type": "application/json" },
    //           apiVersion: { prompt: "v1" },
    //         },
    //       },
    //     });

    //     const executionWithoutSecret = v4();
    //     await prisma.actionExecution.create({
    //       data: {
    //         id: executionWithoutSecret,
    //         projectId,
    //         triggerId,
    //         actionId: actionWithoutSecret,
    //         status: ActionExecutionStatus.PENDING,
    //       },
    //     });

    //     const webhookInput: WebhookInput = {
    //       eventId: v4(),
    //       projectId,
    //       actionId: actionWithoutSecret,
    //       triggerId,
    //       executionId: executionWithoutSecret,
    //       payload: {
    //         promptName: "test-prompt",
    //         promptVersion: 1,
    //         action: "created",
    //         type: "prompt",
    //       },
    //     };

    //     await executeWebhook(webhookInput);

    //     const request = webhookServer.getLastRequest();
    //     expect(request.headers["langfuse-signature"]).toBeUndefined();
    //   });

    //   it("should handle webhook endpoint returning error", async () => {
    //     // Create action pointing to error endpoint
    //     const errorAction = v4();
    //     await prisma.action.create({
    //       data: {
    //         id: errorAction,
    //         projectId,
    //         name: "Error Action",
    //         type: "WEBHOOK",
    //         config: {
    //           type: "WEBHOOK",
    //           url: "https://webhook-error.example.com/test",
    //           headers: { "Content-Type": "application/json" },
    //           apiVersion: { prompt: "v1" },
    //         },
    //       },
    //     });

    //     const errorExecution = v4();
    //     await prisma.actionExecution.create({
    //       data: {
    //         id: errorExecution,
    //         projectId,
    //         triggerId,
    //         actionId: errorAction,
    //         status: ActionExecutionStatus.PENDING,
    //       },
    //     });

    //     const webhookInput: WebhookInput = {
    //       eventId: v4(),
    //       projectId,
    //       actionId: errorAction,
    //       triggerId,
    //       executionId: errorExecution,
    //       payload: {
    //         promptName: "test-prompt",
    //         promptVersion: 1,
    //         action: "created",
    //         type: "prompt",
    //       },
    //     };

    //     await executeWebhook(webhookInput);

    //     // Verify execution was marked as error
    //     const execution = await prisma.actionExecution.findUnique({
    //       where: { id: errorExecution },
    //     });
    //     expect(execution?.status).toBe(ActionExecutionStatus.ERROR);
    //     expect(execution?.error).toContain("Webhook failed with status 500");
    //     expect(execution?.output).toMatchObject({
    //       httpStatus: 500,
    //       responseBody: '{"error":"Internal Server Error"}',
    //     });
    //   });

    //   it("should reject non-HTTPS URLs", async () => {
    //     // Create action with HTTP URL
    //     const httpAction = v4();
    //     await prisma.action.create({
    //       data: {
    //         id: httpAction,
    //         projectId,
    //         name: "HTTP Action",
    //         type: "WEBHOOK",
    //         config: {
    //           type: "WEBHOOK",
    //           url: "http://webhook.example.com/test",
    //           headers: { "Content-Type": "application/json" },
    //           apiVersion: { prompt: "v1" },
    //         },
    //       },
    //     });

    //     const httpExecution = v4();
    //     await prisma.actionExecution.create({
    //       data: {
    //         id: httpExecution,
    //         projectId,
    //         triggerId,
    //         actionId: httpAction,
    //         status: ActionExecutionStatus.PENDING,
    //       },
    //     });

    //     const webhookInput: WebhookInput = {
    //       eventId: v4(),
    //       projectId,
    //       actionId: httpAction,
    //       triggerId,
    //       executionId: httpExecution,
    //       payload: {
    //         promptName: "test-prompt",
    //         promptVersion: 1,
    //         action: "created",
    //         type: "prompt",
    //       },
    //     };

    //     await executeWebhook(webhookInput);

    //     // Verify execution failed with security error
    //     const execution = await prisma.actionExecution.findUnique({
    //       where: { id: httpExecution },
    //     });
    //     expect(execution?.status).toBe(ActionExecutionStatus.ERROR);
    //     expect(execution?.error).toContain("Webhook URL must use HTTPS protocol");
    //   });

    //   it("should disable trigger after 5 consecutive failures", async () => {
    //     // Create 4 previous failed executions
    //     for (let i = 0; i < 4; i++) {
    //       await prisma.actionExecution.create({
    //         data: {
    //           id: v4(),
    //           projectId,
    //           triggerId,
    //           actionId,
    //           status: ActionExecutionStatus.ERROR,
    //           error: "Previous failure",
    //           createdAt: new Date(Date.now() - (5 - i) * 60000), // Space them out
    //         },
    //       });
    //     }

    //     // Create action that will fail
    //     const failingAction = v4();
    //     await prisma.action.create({
    //       data: {
    //         id: failingAction,
    //         projectId,
    //         name: "Failing Action",
    //         type: "WEBHOOK",
    //         config: {
    //           type: "WEBHOOK",
    //           url: "https://webhook-error.example.com/test",
    //           headers: { "Content-Type": "application/json" },
    //           apiVersion: { prompt: "v1" },
    //         },
    //       },
    //     });

    //     const failingExecution = v4();
    //     await prisma.actionExecution.create({
    //       data: {
    //         id: failingExecution,
    //         projectId,
    //         triggerId,
    //         actionId: failingAction,
    //         status: ActionExecutionStatus.PENDING,
    //       },
    //     });

    //     const webhookInput: WebhookInput = {
    //       eventId: v4(),
    //       projectId,
    //       actionId: failingAction,
    //       triggerId,
    //       executionId: failingExecution,
    //       payload: {
    //         promptName: "test-prompt",
    //         promptVersion: 1,
    //         action: "created",
    //         type: "prompt",
    //       },
    //     };

    //     await executeWebhook(webhookInput);

    //     // Verify trigger was disabled
    //     const trigger = await prisma.trigger.findUnique({
    //       where: { id: triggerId },
    //     });
    //     expect(trigger?.status).toBe(JobConfigState.INACTIVE);
    //   });

    //   it("should handle different action types in payload", async () => {
    //     const actionTypes = ["created", "updated", "deleted"] as const;

    //     for (const actionType of actionTypes) {
    //       const testExecution = v4();
    //       await prisma.actionExecution.create({
    //         data: {
    //           id: testExecution,
    //           projectId,
    //           triggerId,
    //           actionId,
    //           status: ActionExecutionStatus.PENDING,
    //         },
    //       });

    //       const webhookInput: WebhookInput = {
    //         eventId: v4(),
    //         projectId,
    //         actionId,
    //         triggerId,
    //         executionId: testExecution,
    //         payload: {
    //           promptName: "test-prompt",
    //           promptVersion: 1,
    //           action: actionType,
    //           type: "prompt",
    //         },
    //       };

    //       await executeWebhook(webhookInput);

    //       const requests = webhookServer.getReceivedRequests();
    //       const lastRequest = requests[requests.length - 1];
    //       const payload = JSON.parse(lastRequest.body);
    //       expect(payload.action).toBe(actionType);

    //       webhookServer.reset();
    //     }
    //   });

    //   it("should truncate response body to 1000 characters", async () => {
    //     // Create a custom action with long response
    //     const longResponseBody = "x".repeat(1500);

    //     webhookServer.server.use(
    //       http.post("https://webhook.example.com/long-response", () => {
    //         return HttpResponse.text(longResponseBody, { status: 200 });
    //       }),
    //     );

    //     const longResponseAction = v4();
    //     await prisma.action.create({
    //       data: {
    //         id: longResponseAction,
    //         projectId,
    //         name: "Long Response Action",
    //         type: "WEBHOOK",
    //         config: {
    //           type: "WEBHOOK",
    //           url: "https://webhook.example.com/long-response",
    //           headers: { "Content-Type": "application/json" },
    //           apiVersion: { prompt: "v1" },
    //         },
    //       },
    //     });

    //     const longResponseExecution = v4();
    //     await prisma.actionExecution.create({
    //       data: {
    //         id: longResponseExecution,
    //         projectId,
    //         triggerId,
    //         actionId: longResponseAction,
    //         status: ActionExecutionStatus.PENDING,
    //       },
    //     });

    //     const webhookInput: WebhookInput = {
    //       eventId: v4(),
    //       projectId,
    //       actionId: longResponseAction,
    //       triggerId,
    //       executionId: longResponseExecution,
    //       payload: {
    //         promptName: "test-prompt",
    //         promptVersion: 1,
    //         action: "created",
    //         type: "prompt",
    //       },
    //     };

    //     await executeWebhook(webhookInput);

    //     const execution = await prisma.actionExecution.findUnique({
    //       where: { id: longResponseExecution },
    //     });

    //     expect(execution?.output).toMatchObject({
    //       httpStatus: 200,
    //       responseBody: "x".repeat(1000), // Truncated to 1000 chars
    //     });
    //   });
    // });

    // describe("webhookProcessor function", () => {
    //   it("should process webhook job successfully", async () => {
    //     const webhookInput: WebhookInput = {
    //       eventId: v4(),
    //       projectId,
    //       actionId,
    //       triggerId,
    //       executionId,
    //       payload: {
    //         promptName: "test-prompt",
    //         promptVersion: 1,
    //         action: "created",
    //         type: "prompt",
    //       },
    //     };

    //     const mockJob: Job<TQueueJobTypes[QueueName.WebhookQueue]> = {
    //       data: {
    //         timestamp: new Date(),
    //         id: v4(),
    //         payload: webhookInput,
    //         name: "webhook-job" as any,
    //       },
    //       attemptsMade: 0,
    //     } as any;

    //     await webhookProcessor(mockJob);

    //     // Verify webhook was called
    //     const requests = webhookServer.getReceivedRequests();
    //     expect(requests).toHaveLength(1);

    //     // Verify execution completed
    //     const execution = await prisma.actionExecution.findUnique({
    //       where: { id: executionId },
    //     });
    //     expect(execution?.status).toBe(ActionExecutionStatus.COMPLETED);
    //   });

    //   it("should handle errors in webhook processing", async () => {
    //     const webhookInput: WebhookInput = {
    //       eventId: v4(),
    //       projectId,
    //       actionId: "non-existent-action",
    //       triggerId,
    //       executionId,
    //       payload: {
    //         promptName: "test-prompt",
    //         promptVersion: 1,
    //         action: "created",
    //         type: "prompt",
    //       },
    //     };

    //     const mockJob: Job<TQueueJobTypes[QueueName.WebhookQueue]> = {
    //       data: {
    //         timestamp: new Date(),
    //         id: v4(),
    //         payload: webhookInput,
    //         name: "webhook-job" as any,
    //       },
    //       attemptsMade: 0,
    //     } as any;

    //     await expect(webhookProcessor(mockJob)).rejects.toThrow(
    //       "Action config not found",
    //     );
    //   });
    // });

    // describe("error handling", () => {
    //   it("should handle non-existent prompt", async () => {
    //     const webhookInput: WebhookInput = {
    //       eventId: v4(),
    //       projectId,
    //       actionId,
    //       triggerId,
    //       executionId,
    //       payload: {
    //         promptName: "non-existent-prompt",
    //         promptVersion: 1,
    //         action: "created",
    //         type: "prompt",
    //       },
    //     };

    //     await executeWebhook(webhookInput);

    //     const execution = await prisma.actionExecution.findUnique({
    //       where: { id: executionId },
    //     });
    //     expect(execution?.status).toBe(ActionExecutionStatus.ERROR);
    //   });

    //   it("should handle non-existent action", async () => {
    //     const webhookInput: WebhookInput = {
    //       eventId: v4(),
    //       projectId,
    //       actionId: "non-existent-action",
    //       triggerId,
    //       executionId,
    //       payload: {
    //         promptName: "test-prompt",
    //         promptVersion: 1,
    //         action: "created",
    //         type: "prompt",
    //       },
    //     };

    //     await expect(executeWebhook(webhookInput)).rejects.toThrow(
    //       "Action config not found",
    //     );
    //   });

    //   it("should handle invalid webhook URL", async () => {
    //     const invalidUrlAction = v4();
    //     await prisma.action.create({
    //       data: {
    //         id: invalidUrlAction,
    //         projectId,
    //         name: "Invalid URL Action",
    //         type: "WEBHOOK",
    //         config: {
    //           type: "WEBHOOK",
    //           url: "invalid-url-format",
    //           headers: { "Content-Type": "application/json" },
    //           apiVersion: { prompt: "v1" },
    //         },
    //       },
    //     });

    //     const invalidUrlExecution = v4();
    //     await prisma.actionExecution.create({
    //       data: {
    //         id: invalidUrlExecution,
    //         projectId,
    //         triggerId,
    //         actionId: invalidUrlAction,
    //         status: ActionExecutionStatus.PENDING,
    //       },
    //     });

    //     const webhookInput: WebhookInput = {
    //       eventId: v4(),
    //       projectId,
    //       actionId: invalidUrlAction,
    //       triggerId,
    //       executionId: invalidUrlExecution,
    //       payload: {
    //         promptName: "test-prompt",
    //         promptVersion: 1,
    //         action: "created",
    //         type: "prompt",
    //       },
    //     };

    //     await executeWebhook(webhookInput);

    //     const execution = await prisma.actionExecution.findUnique({
    //       where: { id: invalidUrlExecution },
    //     });
    //     expect(execution?.status).toBe(ActionExecutionStatus.ERROR);
    //     expect(execution?.error).toContain("Invalid webhook URL");
    //   });
  });
});
