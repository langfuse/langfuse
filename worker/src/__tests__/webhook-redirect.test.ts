import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { executeWebhook } from "../queues/webhooks";
import { prisma } from "@langfuse/shared/src/db";
import { encrypt } from "@langfuse/shared/encryption";
import {
  ActionExecutionStatus,
  JobConfigState,
  PromptDomainSchema,
} from "@langfuse/shared";
import type { WebhookInput } from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";

/**
 * Webhook Redirect Functional Tests
 *
 * These tests verify that the webhook system correctly follows HTTP redirects
 * and handles edge cases like circular redirects, max depth, etc.
 *
 * NOTE: Security validation (blocking private IPs, localhost, etc.) is tested separately in:
 * - worker/src/__tests__/ip-blocking.test.ts
 * - worker/src/__tests__/webhook-validation.test.ts
 *
 * The redirect validation implementation is in:
 * - packages/shared/src/server/webhooks/redirectHandler.ts (fetchWithSecureRedirects)
 * - packages/shared/src/server/webhooks/validation.ts (validateWebhookURL)
 */

// Mock server to handle HTTP redirects
const server = setupServer();

describe("Webhook Redirect Functional Tests", () => {
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
    const orgId = randomUUID();
    const actionId = randomUUID();
    const triggerId = randomUUID();
    const automationId = randomUUID();
    const promptId = randomUUID();
    const executionId = randomUUID();

    // Create org first
    await prisma.organization.create({
      data: {
        id: orgId,
        name: `Test Org ${orgId}`,
      },
    });

    // Create project
    await prisma.project.create({
      data: {
        id: projectId,
        name: `Test Project ${projectId}`,
        orgId,
      },
    });

    // Create prompt (matching webhooks.test.ts structure)
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

    // Create trigger
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

    // Create webhook action with proper config structure
    const secretKey = encrypt("test-secret-key");
    const displaySecretKey = "test-***-key";
    await prisma.action.create({
      data: {
        id: actionId,
        projectId,
        type: "WEBHOOK",
        config: {
          type: "WEBHOOK",
          url: webhookUrl,
          headers: {},
          apiVersion: { prompt: "v1" },
          secretKey,
          displaySecretKey,
        },
      },
    });

    // Create automation
    await prisma.automation.create({
      data: {
        id: automationId,
        projectId,
        triggerId,
        actionId,
        name: "Test Automation",
      },
    });

    return {
      projectId,
      orgId,
      actionId,
      triggerId,
      automationId,
      promptId,
      executionId,
    };
  }

  // Helper function to cleanup test data
  async function cleanupTestData(projectId: string, orgId: string) {
    await prisma.automationExecution.deleteMany({ where: { projectId } });
    await prisma.automation.deleteMany({ where: { projectId } });
    await prisma.action.deleteMany({ where: { projectId } });
    await prisma.trigger.deleteMany({ where: { projectId } });
    await prisma.prompt.deleteMany({ where: { projectId } });
    await prisma.project.delete({ where: { id: projectId } });
    await prisma.organization.delete({ where: { id: orgId } });
  }

  // Helper function to prepare webhook input with execution record
  async function prepareWebhookExecution(
    automation: Awaited<ReturnType<typeof createTestAutomation>>,
  ) {
    const {
      projectId,
      automationId,
      executionId,
      promptId,
      triggerId,
      actionId,
    } = automation;

    // Get the full prompt for the payload
    const fullPrompt = await prisma.prompt.findUnique({
      where: { id: promptId },
    });

    const input: WebhookInput = {
      projectId,
      automationId,
      executionId,
      payload: {
        prompt: PromptDomainSchema.parse(fullPrompt),
        action: "created",
        type: "prompt-version",
      },
    };

    // Create execution record
    await prisma.automationExecution.create({
      data: {
        id: executionId,
        projectId,
        triggerId,
        automationId,
        actionId,
        status: ActionExecutionStatus.PENDING,
        sourceId: executionId,
        input,
      },
    });

    return input;
  }

  describe("Legitimate Redirects", () => {
    it("should follow single redirect to valid public URL", async () => {
      const automation = await createTestAutomation(
        "https://redirector.example.com/step1",
      );

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

      const input = await prepareWebhookExecution(automation);

      await executeWebhook(input, { skipValidation: true });

      expect(step1Called).toBe(true);
      expect(step2Called).toBe(true);

      const execution = await prisma.automationExecution.findFirst({
        where: { id: automation.executionId, projectId: automation.projectId },
      });

      expect(execution).toBeDefined();
      expect(execution?.status).toBe(ActionExecutionStatus.COMPLETED);

      await cleanupTestData(automation.projectId, automation.orgId);
    });

    it("should follow multiple redirects to valid URLs", async () => {
      const automation = await createTestAutomation(
        "https://redirector.example.com/step1",
      );

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

      const input = await prepareWebhookExecution(automation);

      await executeWebhook(input, { skipValidation: true });

      expect(callOrder).toEqual(["step1", "step2", "step3"]);

      const execution = await prisma.automationExecution.findFirst({
        where: { id: automation.executionId, projectId: automation.projectId },
      });

      expect(execution).toBeDefined();
      expect(execution?.status).toBe(ActionExecutionStatus.COMPLETED);

      await cleanupTestData(automation.projectId, automation.orgId);
    });

    it("should handle no redirects (direct response)", async () => {
      const automation = await createTestAutomation(
        "https://direct.example.com/webhook",
      );

      let called = false;

      server.use(
        http.post("https://direct.example.com/webhook", () => {
          called = true;
          return HttpResponse.json({ success: true }, { status: 200 });
        }),
      );

      const input = await prepareWebhookExecution(automation);

      await executeWebhook(input, { skipValidation: true });

      expect(called).toBe(true);

      const execution = await prisma.automationExecution.findFirst({
        where: { id: automation.executionId, projectId: automation.projectId },
      });

      expect(execution).toBeDefined();
      expect(execution?.status).toBe(ActionExecutionStatus.COMPLETED);

      await cleanupTestData(automation.projectId, automation.orgId);
    });

    it("should resolve relative URL redirects correctly", async () => {
      const automation = await createTestAutomation(
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

      const input = await prepareWebhookExecution(automation);

      await executeWebhook(input, { skipValidation: true });

      expect(finalCalled).toBe(true);

      const execution = await prisma.automationExecution.findFirst({
        where: { id: automation.executionId, projectId: automation.projectId },
      });

      expect(execution).toBeDefined();
      expect(execution?.status).toBe(ActionExecutionStatus.COMPLETED);

      await cleanupTestData(automation.projectId, automation.orgId);
    });
  });

  describe("Edge Cases", () => {
    it("should fail when max redirect depth exceeded", async () => {
      const automation = await createTestAutomation(
        "https://infinite-redirect.example.com/step0",
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

      const input = await prepareWebhookExecution(automation);

      await executeWebhook(input, { skipValidation: true });

      const execution = await prisma.automationExecution.findFirst({
        where: { id: automation.executionId, projectId: automation.projectId },
      });

      expect(execution).toBeDefined();
      expect(execution?.status).toBe(ActionExecutionStatus.ERROR);
      expect(execution?.error).toContain("Maximum redirects");

      await cleanupTestData(automation.projectId, automation.orgId);
    });

    it("should detect and block circular redirects", async () => {
      const automation = await createTestAutomation(
        "https://circular.example.com/a",
      );

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

      const input = await prepareWebhookExecution(automation);

      await executeWebhook(input, { skipValidation: true });

      const execution = await prisma.automationExecution.findFirst({
        where: { id: automation.executionId, projectId: automation.projectId },
      });

      expect(execution).toBeDefined();
      expect(execution?.status).toBe(ActionExecutionStatus.ERROR);
      expect(execution?.error).toContain("Circular redirect detected");

      await cleanupTestData(automation.projectId, automation.orgId);
    });

    it("should fail on missing Location header in redirect response", async () => {
      const automation = await createTestAutomation(
        "https://broken-redirect.example.com/hook",
      );

      server.use(
        http.post("https://broken-redirect.example.com/hook", () => {
          // Return 302 without Location header
          return new Response(null, { status: 302 });
        }),
      );

      const input = await prepareWebhookExecution(automation);

      await executeWebhook(input, { skipValidation: true });

      const execution = await prisma.automationExecution.findFirst({
        where: { id: automation.executionId, projectId: automation.projectId },
      });

      expect(execution).toBeDefined();
      expect(execution?.status).toBe(ActionExecutionStatus.ERROR);
      expect(execution?.error).toContain("missing Location header");

      await cleanupTestData(automation.projectId, automation.orgId);
    });
  });
});
