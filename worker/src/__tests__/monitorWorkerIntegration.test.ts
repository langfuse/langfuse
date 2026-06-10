/** monitorWorkerIntegration.test.ts drives the full scheduler → processor → webhook dispatch → webhook received flow;
 * BullMq and ClickHouse are mocked. Posgtgress is injected.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
  vi,
} from "vitest";
import { v4 } from "uuid";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { Prisma } from "@prisma/client";

import { JobConfigState } from "@langfuse/shared";
import {
  createOrgProjectAndApiKey,
  redis,
  type WebhookInput,
} from "@langfuse/shared/src/server";
import {
  MonitorProcessor,
  type MonitorQueueEvent,
  MonitorQueueEventSchema,
  MonitorScheduler,
} from "@langfuse/shared/monitors/server";
import { prisma } from "@langfuse/shared/src/db";
import { encrypt, generateWebhookSecret } from "@langfuse/shared/encryption";

import { executeWebhook } from "../queues/webhooks";

describe("monitor-alert e2e (scheduler → processor → dispatcher → webhook URL)", () => {
  let projectId: string;

  beforeAll(() => {
    webhookServer.setup();
  });

  beforeEach(async () => {
    webhookServer.reset();
    ({ projectId } = await createOrgProjectAndApiKey());
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await prisma.monitor.deleteMany({ where: { projectId } });
    webhookServer.reset();
  });

  afterAll(() => {
    webhookServer.teardown();
  });

  it("posts a monitor-alert envelope to the webhook URL", async () => {
    const { triggerId } = await seedWebhookAutomation({
      projectId,
      url: "https://webhook.example.com/monitor-e2e",
      triggerFilter: [
        {
          column: "severity",
          operator: "any of",
          value: ["ALERT"],
          type: "stringOptions",
        },
      ],
    });
    const monitorId = await seedMonitor({
      projectId,
      alertThreshold: 100,
      triggerIds: [triggerId],
    });
    // Capture now after seeding so the monitor's nextRunAt is strictly in the past.
    const now = new Date();

    // 1. Scheduler publishes monitor queue events for due Monitors
    let monitorQueueEvents: MonitorQueueEvent[] = [];
    const scheduler = new MonitorScheduler({
      schedulerId: 0,
      totalSchedulers: 1,
      db: prisma,
      publish: async (event) => {
        monitorQueueEvents.push(MonitorQueueEventSchema.parse(event));
      },
    });
    await scheduler.schedule(now);
    monitorQueueEvents = monitorQueueEvents.filter(
      (e) => e.projectId === projectId, // isolate the scheduler check to this test project
    );
    expect(monitorQueueEvents).toHaveLength(1);

    // 2. Processor executes the scheduled job (ClickHouse mocked above threshold).
    const webhookInputs: WebhookInput[] = [];
    const processor = new MonitorProcessor(
      prisma,
      async (event) => {
        webhookInputs.push(event);
      },
      async () => [{ count_count: 150 }],
    );
    await Promise.all(
      monitorQueueEvents.map((monitorQueueEvent) =>
        processor.process(monitorQueueEvent, now),
      ),
    );
    expect(webhookInputs).toHaveLength(1);

    // 3. Webhook processor executes the webhook inputs.
    for (const input of webhookInputs) {
      await executeWebhook(input, { skipValidation: true });
    }

    // 4. Webhook server receives one monitor-alert envelope per scheduled event.
    const requests = webhookServer.getReceivedRequests();
    expect(requests).toHaveLength(monitorQueueEvents.length);
    monitorQueueEvents.forEach((event, i) => {
      const body = JSON.parse(requests[i].body);
      // Window edges anchor to the scheduler's runAt (the cadence boundary), not now.
      const expectedTo = new Date(event.runAt.getTime() - 30_000).toISOString();
      const expectedFrom = new Date(
        event.runAt.getTime() - 30_000 - 5 * 60_000,
      ).toISOString();
      expect(body).toMatchObject({
        type: "monitor-alert",
        apiVersion: "v1",
        payload: {
          monitorId,
          severity: "ALERT",
          fromTimestamp: expectedFrom,
          toTimestamp: expectedTo,
        },
      });
    });
  });

  it("redis.del failure on a delivered monitor-alert webhook: does not increment the failure counter", async () => {
    const { triggerId } = await seedWebhookAutomation({
      projectId,
      url: "https://webhook.example.com/monitor-redis-del-fail",
      triggerFilter: [
        {
          column: "severity",
          operator: "any of",
          value: ["ALERT"],
          type: "stringOptions",
        },
      ],
    });
    const monitorId = await seedMonitor({
      projectId,
      alertThreshold: 100,
      triggerIds: [triggerId],
    });
    const now = new Date();

    const delSpy = vi
      .spyOn(redis!, "del")
      .mockRejectedValueOnce(new Error("READONLY simulated failover"));
    const multiSpy = vi.spyOn(redis!, "multi");

    const monitorQueueEvents: MonitorQueueEvent[] = [];
    const scheduler = new MonitorScheduler({
      schedulerId: 0,
      totalSchedulers: 1,
      db: prisma,
      publish: async (event) => {
        monitorQueueEvents.push(MonitorQueueEventSchema.parse(event));
      },
    });
    await scheduler.schedule(now);
    const projectEvents = monitorQueueEvents.filter(
      (e) => e.projectId === projectId,
    );
    expect(projectEvents).toHaveLength(1);

    const webhookInputs: WebhookInput[] = [];
    const processor = new MonitorProcessor(
      prisma,
      async (event) => {
        webhookInputs.push(event);
      },
      async () => [{ count_count: 150 }],
    );
    await Promise.all(
      projectEvents.map((event) => processor.process(event, now)),
    );
    expect(webhookInputs).toHaveLength(1);

    for (const input of webhookInputs) {
      await expect(
        executeWebhook(input, { skipValidation: true }),
      ).resolves.not.toThrow();
    }

    expect(delSpy).toHaveBeenCalled();
    expect(multiSpy).not.toHaveBeenCalled();

    const trigger = await prisma.trigger.findUnique({
      where: { id: triggerId, projectId },
    });
    expect(trigger?.status).toBe(JobConfigState.ACTIVE);
    expect(monitorId).toBeTruthy();
  });

  it("does not write AutomationExecution rows for monitor-alert dispatches", async () => {
    const now = new Date();
    const { triggerId } = await seedWebhookAutomation({
      projectId,
      url: "https://webhook.example.com/monitor-no-exec",
      triggerFilter: [
        {
          column: "severity",
          operator: "any of",
          value: ["ALERT"],
          type: "stringOptions",
        },
      ],
    });
    await seedMonitor({
      projectId,
      alertThreshold: 100,
      triggerIds: [triggerId],
    });

    const before = await prisma.automationExecution.count({
      where: { projectId },
    });

    const monitorQueueEvents: MonitorQueueEvent[] = [];
    const scheduler = new MonitorScheduler({
      schedulerId: 0,
      totalSchedulers: 1,
      db: prisma,
      publish: async (event) => {
        monitorQueueEvents.push(MonitorQueueEventSchema.parse(event));
      },
    });
    await scheduler.schedule(now);
    const projectEvents = monitorQueueEvents.filter(
      (e) => e.projectId === projectId,
    );
    expect(projectEvents).toHaveLength(1);

    const captured: WebhookInput[] = [];
    const processor = new MonitorProcessor(
      prisma,
      async (input) => {
        captured.push(input);
      },
      async () => [{ count_count: 150 }],
    );
    await Promise.all(
      projectEvents.map((event) => processor.process(event, now)),
    );
    expect(captured).toHaveLength(1);
    for (const input of captured) {
      await executeWebhook(input, { skipValidation: true });
    }

    const after = await prisma.automationExecution.count({
      where: { projectId },
    });
    expect(after).toBe(before);
  });
});

/** WebhookTestServer records webhook POSTs via MSW so tests can assert on them. */
class WebhookTestServer {
  private server;
  private receivedRequests: Array<{
    url: string;
    method: string;
    body: string;
  }> = [];

  constructor() {
    this.server = setupServer(
      http.post("https://webhook.example.com/*", async ({ request }) => {
        this.receivedRequests.push({
          url: request.url,
          method: request.method,
          body: JSON.stringify(await request.json()),
        });
        return HttpResponse.json({ success: true }, { status: 200 });
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
}

/** webhookServer is the suite-wide MSW capture server. */
const webhookServer = new WebhookTestServer();

/** seedWebhookAutomation creates a monitor-source trigger and webhook automation whose URL MSW captures, returning the created ids for assertions. */
async function seedWebhookAutomation(args: {
  projectId: string;
  url: string;
  triggerFilter: {
    column: string;
    operator: string;
    value: unknown;
    type: string;
  }[];
}) {
  const triggerId = v4();
  await prisma.trigger.create({
    data: {
      id: triggerId,
      projectId: args.projectId,
      eventSource: "monitor",
      eventActions: [],
      filter: args.triggerFilter as unknown as Prisma.InputJsonValue,
      status: JobConfigState.ACTIVE,
    },
  });

  const actionId = v4();
  const { secretKey, displaySecretKey } = generateWebhookSecret();
  await prisma.action.create({
    data: {
      id: actionId,
      projectId: args.projectId,
      type: "WEBHOOK",
      config: {
        type: "WEBHOOK",
        url: args.url,
        apiVersion: { monitor: "v1" },
        secretKey: encrypt(secretKey),
        displaySecretKey,
      },
    },
  });

  const automationId = v4();
  await prisma.automation.create({
    data: {
      id: automationId,
      projectId: args.projectId,
      triggerId,
      actionId,
      name: "Monitor e2e Automation",
    },
  });

  return { triggerId, actionId, automationId };
}

/** seedMonitor inserts a due monitor row; triggerIds gates which monitor-source triggers the processor routes its alerts to. */
async function seedMonitor(args: {
  projectId: string;
  alertThreshold: number;
  triggerIds?: string[];
}) {
  const id = `mon_${v4()}`;
  await prisma.monitor.create({
    data: {
      id,
      projectId: args.projectId,
      view: "OBSERVATIONS",
      filters: [],
      metric: { measure: "count", aggregation: "count" },
      windowMs: 5n * 60n * 1000n,
      cadenceMs: 60n * 1000n,
      thresholdOperator: "GT",
      alertThreshold: args.alertThreshold,
      warningThreshold: null,
      noData: { mode: "SHOW_NO_DATA" },
      renotify: { mode: "OFF" },
      status: "ACTIVE",
      schedulerBatchId: 0n,
      nextRunAt: new Date(Date.now() - 1000),
      lastPublishedAt: null,
      lastClaimedAt: null,
      lastCompletedAt: null,
      severity: "UNKNOWN",
      severityChangedAt: null,
      alertedAt: null,
      tags: [],
      triggerIds: args.triggerIds ?? [],
      name: "e2e monitor",
    },
  });
  return id;
}
