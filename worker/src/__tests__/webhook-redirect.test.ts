import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { executeWebhook } from "../queues/webhooks";
import { prisma } from "@langfuse/shared/src/db";
import { encrypt } from "@langfuse/shared/encryption";
import {
  ActionExecutionStatus,
  JobConfigState,
} from "@langfuse/shared/src/features/automations/constants";
import type { WebhookInput } from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";

// Mock server to handle HTTP redirects
const server = setupServer();

describe("Webhook Redirect Security Tests", () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: "bypass" });
  });

  afterAll(() => {
    server.close();
  });

  beforeEach(() => {
    server.resetHandlers();
  });

  // Helper function to create test automation with webhook action
  async function createTestAutomation(webhookUrl: string) {
    const projectId = randomUUID();
    const actionId = randomUUID();
    const triggerId = randomUUID();
    const automationId = randomUUID();
    const promptId = randomUUID();
    const promptVersionId = randomUUID();
    const executionId = randomUUID();

    // Create project
    await prisma.project.create({
      data: {
        id: projectId,
        name: `Test Project ${projectId}`,
        orgId: randomUUID(),
      },
    });

    // Create prompt
    await prisma.prompt.create({
      data: {
        id: promptId,
        projectId,
        name: "test-prompt",
        createdBy: "test",
        type: "text",
      },
    });

    // Create prompt version
    await prisma.promptVersion.create({
      data: {
        id: promptVersionId,
        projectId,
        promptId,
        version: 1,
        prompt: "test prompt content",
        config: {},
      },
    });

    // Create trigger
    await prisma.trigger.create({
      data: {
        id: triggerId,
        projectId,
        name: "Test Trigger",
        description: "Test trigger for redirect tests",
        eventType: "PromptPublished",
        status: JobConfigState.ACTIVE,
        filter: JSON.stringify({}),
      },
    });

    // Create webhook action
    const secretKey = encrypt("test-secret-key");
    await prisma.action.create({
      data: {
        id: actionId,
        projectId,
        type: "WEBHOOK",
        name: "Test Webhook Action",
        config: {
          url: webhookUrl,
          secretKey,
          requestHeaders: {},
        },
      },
    });

    // Create automation
    await prisma.automation.create({
      data: {
        id: automationId,
        projectId,
        actionId,
        triggerId,
      },
    });

    return {
      projectId,
      actionId,
      triggerId,
      automationId,
      promptId,
      promptVersionId,
      executionId,
    };
  }

  // Helper function to cleanup test data
  async function cleanupTestData(projectId: string) {
    await prisma.automationExecution.deleteMany({ where: { projectId } });
    await prisma.automation.deleteMany({ where: { projectId } });
    await prisma.action.deleteMany({ where: { projectId } });
    await prisma.trigger.deleteMany({ where: { projectId } });
    await prisma.promptVersion.deleteMany({ where: { projectId } });
    await prisma.prompt.deleteMany({ where: { projectId } });
    await prisma.project.delete({ where: { id: projectId } });
  }

  describe("Security Tests - Blocking Malicious Redirects", () => {
    it("should block redirect to localhost (127.0.0.1)", async () => {
      const { projectId, automationId, executionId, promptVersionId } =
        await createTestAutomation(
          "https://evil-redirect-localhost.example.com/hook",
        );

      // Setup mock server with redirect to localhost
      server.use(
        http.post("https://evil-redirect-localhost.example.com/hook", () => {
          return new Response(null, {
            status: 302,
            headers: { Location: "http://127.0.0.1/internal" },
          });
        }),
      );

      const input: WebhookInput = {
        projectId,
        automationId,
        executionId,
        payload: {
          type: "PromptPublished",
          action: "publish",
          prompt: {
            id: promptVersionId,
            name: "test-prompt",
            version: 1,
          },
        },
      };

      // Should not throw - error is handled internally
      await executeWebhook(input, { skipValidation: false });

      // Verify execution failed due to redirect validation
      const execution = await prisma.automationExecution.findFirst({
        where: { id: executionId, projectId },
      });

      expect(execution).toBeDefined();
      expect(execution?.status).toBe(ActionExecutionStatus.ERROR);
      expect(execution?.error).toContain("Redirect validation failed");

      await cleanupTestData(projectId);
    });

    it("should block redirect to private network (192.168.x.x)", async () => {
      const { projectId, automationId, executionId, promptVersionId } =
        await createTestAutomation(
          "https://evil-redirect-private.example.com/hook",
        );

      server.use(
        http.post("https://evil-redirect-private.example.com/hook", () => {
          return new Response(null, {
            status: 302,
            headers: { Location: "http://192.168.1.1/internal" },
          });
        }),
      );

      const input: WebhookInput = {
        projectId,
        automationId,
        executionId,
        payload: {
          type: "PromptPublished",
          action: "publish",
          prompt: {
            id: promptVersionId,
            name: "test-prompt",
            version: 1,
          },
        },
      };

      await executeWebhook(input, { skipValidation: false });

      const execution = await prisma.automationExecution.findFirst({
        where: { id: executionId, projectId },
      });

      expect(execution).toBeDefined();
      expect(execution?.status).toBe(ActionExecutionStatus.ERROR);
      expect(execution?.error).toContain("Redirect validation failed");

      await cleanupTestData(projectId);
    });

    it("should block redirect to AWS metadata endpoint (169.254.169.254)", async () => {
      const { projectId, automationId, executionId, promptVersionId } =
        await createTestAutomation(
          "https://evil-redirect-metadata.example.com/hook",
        );

      server.use(
        http.post("https://evil-redirect-metadata.example.com/hook", () => {
          return new Response(null, {
            status: 302,
            headers: { Location: "http://169.254.169.254/latest/meta-data/" },
          });
        }),
      );

      const input: WebhookInput = {
        projectId,
        automationId,
        executionId,
        payload: {
          type: "PromptPublished",
          action: "publish",
          prompt: {
            id: promptVersionId,
            name: "test-prompt",
            version: 1,
          },
        },
      };

      await executeWebhook(input, { skipValidation: false });

      const execution = await prisma.automationExecution.findFirst({
        where: { id: executionId, projectId },
      });

      expect(execution).toBeDefined();
      expect(execution?.status).toBe(ActionExecutionStatus.ERROR);
      expect(execution?.error).toContain("Redirect validation failed");

      await cleanupTestData(projectId);
    });

    it("should block redirect to Docker internal hostname", async () => {
      const { projectId, automationId, executionId, promptVersionId } =
        await createTestAutomation(
          "https://evil-redirect-docker.example.com/hook",
        );

      server.use(
        http.post("https://evil-redirect-docker.example.com/hook", () => {
          return new Response(null, {
            status: 302,
            headers: { Location: "http://host.docker.internal:8080/api" },
          });
        }),
      );

      const input: WebhookInput = {
        projectId,
        automationId,
        executionId,
        payload: {
          type: "PromptPublished",
          action: "publish",
          prompt: {
            id: promptVersionId,
            name: "test-prompt",
            version: 1,
          },
        },
      };

      await executeWebhook(input, { skipValidation: false });

      const execution = await prisma.automationExecution.findFirst({
        where: { id: executionId, projectId },
      });

      expect(execution).toBeDefined();
      expect(execution?.status).toBe(ActionExecutionStatus.ERROR);
      // Could fail on hostname blocking or port validation
      expect(execution?.error).toMatch(
        /Redirect validation failed|Only ports 80 and 443 are allowed/,
      );

      await cleanupTestData(projectId);
    });

    it("should block redirect to internal service (10.x.x.x)", async () => {
      const { projectId, automationId, executionId, promptVersionId } =
        await createTestAutomation(
          "https://evil-redirect-internal.example.com/hook",
        );

      server.use(
        http.post("https://evil-redirect-internal.example.com/hook", () => {
          return new Response(null, {
            status: 302,
            headers: { Location: "http://10.0.0.5/admin" },
          });
        }),
      );

      const input: WebhookInput = {
        projectId,
        automationId,
        executionId,
        payload: {
          type: "PromptPublished",
          action: "publish",
          prompt: {
            id: promptVersionId,
            name: "test-prompt",
            version: 1,
          },
        },
      };

      await executeWebhook(input, { skipValidation: false });

      const execution = await prisma.automationExecution.findFirst({
        where: { id: executionId, projectId },
      });

      expect(execution).toBeDefined();
      expect(execution?.status).toBe(ActionExecutionStatus.ERROR);
      expect(execution?.error).toContain("Redirect validation failed");

      await cleanupTestData(projectId);
    });
  });

  describe("Functional Tests - Legitimate Redirects", () => {
    it("should follow single redirect to valid public URL", async () => {
      const { projectId, automationId, executionId, promptVersionId } =
        await createTestAutomation("https://redirector.example.com/step1");

      let step1Called = false;
      let step2Called = false;

      server.use(
        http.post("https://redirector.example.com/step1", () => {
          step1Called = true;
          return new Response(null, {
            status: 302,
            headers: { Location: "https://final.example.com/webhook" },
          });
        }),
        http.post("https://final.example.com/webhook", () => {
          step2Called = true;
          return HttpResponse.json({ success: true }, { status: 200 });
        }),
      );

      const input: WebhookInput = {
        projectId,
        automationId,
        executionId,
        payload: {
          type: "PromptPublished",
          action: "publish",
          prompt: {
            id: promptVersionId,
            name: "test-prompt",
            version: 1,
          },
        },
      };

      await executeWebhook(input, { skipValidation: true });

      expect(step1Called).toBe(true);
      expect(step2Called).toBe(true);

      const execution = await prisma.automationExecution.findFirst({
        where: { id: executionId, projectId },
      });

      expect(execution).toBeDefined();
      expect(execution?.status).toBe(ActionExecutionStatus.COMPLETED);

      await cleanupTestData(projectId);
    });

    it("should follow multiple redirects to valid URLs", async () => {
      const { projectId, automationId, executionId, promptVersionId } =
        await createTestAutomation("https://redirector.example.com/step1");

      const callOrder: string[] = [];

      server.use(
        http.post("https://redirector.example.com/step1", () => {
          callOrder.push("step1");
          return new Response(null, {
            status: 302,
            headers: { Location: "https://redirector.example.com/step2" },
          });
        }),
        http.post("https://redirector.example.com/step2", () => {
          callOrder.push("step2");
          return new Response(null, {
            status: 302,
            headers: { Location: "https://redirector.example.com/step3" },
          });
        }),
        http.post("https://redirector.example.com/step3", () => {
          callOrder.push("step3");
          return HttpResponse.json({ success: true }, { status: 200 });
        }),
      );

      const input: WebhookInput = {
        projectId,
        automationId,
        executionId,
        payload: {
          type: "PromptPublished",
          action: "publish",
          prompt: {
            id: promptVersionId,
            name: "test-prompt",
            version: 1,
          },
        },
      };

      await executeWebhook(input, { skipValidation: true });

      expect(callOrder).toEqual(["step1", "step2", "step3"]);

      const execution = await prisma.automationExecution.findFirst({
        where: { id: executionId, projectId },
      });

      expect(execution).toBeDefined();
      expect(execution?.status).toBe(ActionExecutionStatus.COMPLETED);

      await cleanupTestData(projectId);
    });

    it("should handle no redirects (direct response)", async () => {
      const { projectId, automationId, executionId, promptVersionId } =
        await createTestAutomation("https://direct.example.com/webhook");

      let called = false;

      server.use(
        http.post("https://direct.example.com/webhook", () => {
          called = true;
          return HttpResponse.json({ success: true }, { status: 200 });
        }),
      );

      const input: WebhookInput = {
        projectId,
        automationId,
        executionId,
        payload: {
          type: "PromptPublished",
          action: "publish",
          prompt: {
            id: promptVersionId,
            name: "test-prompt",
            version: 1,
          },
        },
      };

      await executeWebhook(input, { skipValidation: true });

      expect(called).toBe(true);

      const execution = await prisma.automationExecution.findFirst({
        where: { id: executionId, projectId },
      });

      expect(execution).toBeDefined();
      expect(execution?.status).toBe(ActionExecutionStatus.COMPLETED);

      await cleanupTestData(projectId);
    });
  });

  describe("Edge Cases", () => {
    it("should fail when max redirect depth exceeded", async () => {
      const { projectId, automationId, executionId, promptVersionId } =
        await createTestAutomation(
          "https://infinite-redirect.example.com/start",
        );

      // Create 11 redirects (exceeds default max of 10)
      const handlers = [];
      for (let i = 0; i < 11; i++) {
        const currentStep = i;
        const nextStep = i + 1;
        handlers.push(
          http.post(
            `https://infinite-redirect.example.com/step${currentStep}`,
            () => {
              return new Response(null, {
                status: 302,
                headers: {
                  Location: `https://infinite-redirect.example.com/step${nextStep}`,
                },
              });
            },
          ),
        );
      }

      server.use(...handlers);

      const input: WebhookInput = {
        projectId,
        automationId,
        executionId,
        payload: {
          type: "PromptPublished",
          action: "publish",
          prompt: {
            id: promptVersionId,
            name: "test-prompt",
            version: 1,
          },
        },
      };

      await executeWebhook(input, { skipValidation: true });

      const execution = await prisma.automationExecution.findFirst({
        where: { id: executionId, projectId },
      });

      expect(execution).toBeDefined();
      expect(execution?.status).toBe(ActionExecutionStatus.ERROR);
      expect(execution?.error).toContain("Maximum redirects");

      await cleanupTestData(projectId);
    });

    it("should detect and block circular redirects", async () => {
      const { projectId, automationId, executionId, promptVersionId } =
        await createTestAutomation("https://circular.example.com/a");

      server.use(
        http.post("https://circular.example.com/a", () => {
          return new Response(null, {
            status: 302,
            headers: { Location: "https://circular.example.com/b" },
          });
        }),
        http.post("https://circular.example.com/b", () => {
          return new Response(null, {
            status: 302,
            headers: { Location: "https://circular.example.com/a" },
          });
        }),
      );

      const input: WebhookInput = {
        projectId,
        automationId,
        executionId,
        payload: {
          type: "PromptPublished",
          action: "publish",
          prompt: {
            id: promptVersionId,
            name: "test-prompt",
            version: 1,
          },
        },
      };

      await executeWebhook(input, { skipValidation: true });

      const execution = await prisma.automationExecution.findFirst({
        where: { id: executionId, projectId },
      });

      expect(execution).toBeDefined();
      expect(execution?.status).toBe(ActionExecutionStatus.ERROR);
      expect(execution?.error).toContain("Circular redirect detected");

      await cleanupTestData(projectId);
    });

    it("should fail on missing Location header in redirect response", async () => {
      const { projectId, automationId, executionId, promptVersionId } =
        await createTestAutomation("https://broken-redirect.example.com/hook");

      server.use(
        http.post("https://broken-redirect.example.com/hook", () => {
          // Return 302 without Location header
          return new Response(null, { status: 302 });
        }),
      );

      const input: WebhookInput = {
        projectId,
        automationId,
        executionId,
        payload: {
          type: "PromptPublished",
          action: "publish",
          prompt: {
            id: promptVersionId,
            name: "test-prompt",
            version: 1,
          },
        },
      };

      await executeWebhook(input, { skipValidation: true });

      const execution = await prisma.automationExecution.findFirst({
        where: { id: executionId, projectId },
      });

      expect(execution).toBeDefined();
      expect(execution?.status).toBe(ActionExecutionStatus.ERROR);
      expect(execution?.error).toContain("missing Location header");

      await cleanupTestData(projectId);
    });

    it("should resolve relative URL redirects correctly", async () => {
      const { projectId, automationId, executionId, promptVersionId } =
        await createTestAutomation(
          "https://relative-redirect.example.com/start",
        );

      let finalCalled = false;

      server.use(
        http.post("https://relative-redirect.example.com/start", () => {
          return new Response(null, {
            status: 302,
            headers: { Location: "/final" }, // Relative URL
          });
        }),
        http.post("https://relative-redirect.example.com/final", () => {
          finalCalled = true;
          return HttpResponse.json({ success: true }, { status: 200 });
        }),
      );

      const input: WebhookInput = {
        projectId,
        automationId,
        executionId,
        payload: {
          type: "PromptPublished",
          action: "publish",
          prompt: {
            id: promptVersionId,
            name: "test-prompt",
            version: 1,
          },
        },
      };

      await executeWebhook(input, { skipValidation: true });

      expect(finalCalled).toBe(true);

      const execution = await prisma.automationExecution.findFirst({
        where: { id: executionId, projectId },
      });

      expect(execution).toBeDefined();
      expect(execution?.status).toBe(ActionExecutionStatus.COMPLETED);

      await cleanupTestData(projectId);
    });
  });
});
