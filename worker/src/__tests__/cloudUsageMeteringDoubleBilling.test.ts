/**
 * The metering job bills every org in one loop and only advances the cron
 * marker after the whole loop finishes. If one org's Stripe call fails, the
 * queue re-enqueues the same interval and the retry re-bills the orgs that
 * already succeeded. Stripe dedupes meter events by identifier, so the fix is
 * to send a stable identifier per org/event/interval. Stripe is mocked here,
 * so this checks the property that makes the dedupe work: the same org, event
 * type and interval produce the same identifier on the first run and the retry.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma } from "@langfuse/shared/src/db";
import { CloudConfigSchema } from "@langfuse/shared";

const meterEventsCreate = vi.fn();

vi.mock("stripe", () => {
  function FakeStripe() {
    return {
      billing: {
        meterEvents: {
          create: meterEventsCreate,
        },
      },
    };
  }
  return { default: FakeStripe };
});

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@langfuse/shared/src/server")>();
  return {
    ...actual,
    getObservationCountsByProjectInCreationInterval: vi.fn(async () => [
      { projectId: "cum-test-project-a", count: 10 },
      { projectId: "cum-test-project-b", count: 20 },
    ]),
    getTraceCountsByProjectInCreationInterval: vi.fn(async () => []),
    getScoreCountsByProjectInCreationInterval: vi.fn(async () => []),
    // Never actually enqueue follow-up jobs against real redis/BullMQ.
    CloudUsageMeteringQueue: { getInstance: () => ({ add: vi.fn() }) },
    CloudSpendAlertQueue: { getInstance: () => ({ add: vi.fn() }) },
  };
});

describe("Cloud Usage Metering idempotent retry after a mid-loop Stripe failure", () => {
  const orgAId = "cum-test-org-a";
  const orgBId = "cum-test-org-b";
  const projectAId = "cum-test-project-a";
  const projectBId = "cum-test-project-b";
  const cronName = "cloud_usage_metering";

  const hourStart = new Date(
    Math.floor(Date.now() / 3600000) * 3600000 - 3 * 3600000,
  );

  beforeEach(async () => {
    meterEventsCreate.mockReset();

    await prisma.project.deleteMany({
      where: { id: { in: [projectAId, projectBId] } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: [orgAId, orgBId] } },
    });
    await prisma.cronJobs.deleteMany({ where: { name: cronName } });

    await prisma.organization.create({
      data: {
        id: orgAId,
        name: "CUM Test Org A",
        cloudConfig: CloudConfigSchema.parse({
          stripe: { customerId: "cus_test_org_a" },
        }),
      },
    });
    await prisma.project.create({
      data: { id: projectAId, name: "CUM Test Project A", orgId: orgAId },
    });

    await prisma.organization.create({
      data: {
        id: orgBId,
        name: "CUM Test Org B",
        cloudConfig: CloudConfigSchema.parse({
          stripe: { customerId: "cus_test_org_b" },
        }),
      },
    });
    await prisma.project.create({
      data: { id: projectBId, name: "CUM Test Project B", orgId: orgBId },
    });

    // Cron row primed so the job is immediately due (lastRun far enough in
    // the past) and in the Queued state.
    await prisma.cronJobs.create({
      data: {
        name: cronName,
        state: "queued",
        lastRun: hourStart,
      },
    });
  });

  afterEach(async () => {
    await prisma.project.deleteMany({
      where: { id: { in: [projectAId, projectBId] } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: [orgAId, orgBId] } },
    });
    await prisma.cronJobs.deleteMany({ where: { name: cronName } });
    vi.restoreAllMocks();
  });

  it("reuses the same meter-event identifier for an org across a failed run and its retry", async () => {
    const { handleCloudUsageMeteringJob } = await import(
      "../ee/cloudUsageMetering/handleCloudUsageMeteringJob"
    );

    const fakeJob = {
      id: "job-1",
      data: {},
      opts: {},
      updateProgress: vi.fn(),
    } as any;

    // Run 1: the job makes two meter calls per org (observations + events).
    // Fail on the third call so the first org processed is fully billed and
    // the second one fails partway, which is the partial-progress-then-failure
    // case. This doesn't assume which org comes first, since findMany has no
    // orderBy and Postgres can return either order.
    const settledRun1: Array<{
      customerId: string;
      identifier: string | undefined;
      ok: boolean;
    }> = [];
    let run1Calls = 0;
    meterEventsCreate.mockImplementation(async (args: any) => {
      const customerId = args?.payload?.stripe_customer_id as string;
      const identifier = args?.identifier as string | undefined;
      run1Calls += 1;
      if (run1Calls >= 3) {
        settledRun1.push({ customerId, identifier, ok: false });
        throw new Error("simulated transient Stripe failure");
      }
      settledRun1.push({ customerId, identifier, ok: true });
      return { id: "me_1" };
    });

    await expect(handleCloudUsageMeteringJob(fakeJob)).rejects.toThrow(
      "simulated transient Stripe failure",
    );

    const successfulRun1 = settledRun1.filter((s) => s.ok);
    // The first org is billed in full before the failure: its observations and
    // events calls, all for the same customer.
    expect(successfulRun1).toHaveLength(2);
    const billedCustomer = successfulRun1[0].customerId;
    expect(successfulRun1.every((s) => s.customerId === billedCustomer)).toBe(
      true,
    );

    // Each of those carries a stable identifier (the fix) rather than a random
    // one from Stripe.
    for (const call of successfulRun1) {
      expect(call.identifier).toMatch(
        /^lf-cum-test-org-[ab]-tracing_(observations|events)-\d+$/,
      );
    }

    // Do what the queue processor does on error: reset the cron row to
    // Queued (jobStartedAt: null) and leave lastRun untouched. See the catch
    // block in worker/src/queues/cloudUsageMeteringQueue.ts.
    await prisma.cronJobs.update({
      where: { name: cronName },
      data: { state: "queued", jobStartedAt: null },
    });

    // Run 2 is the retry for the same, still-unadvanced interval. Both orgs
    // succeed this time.
    const settledRun2: Array<{
      customerId: string;
      identifier: string | undefined;
    }> = [];
    meterEventsCreate.mockImplementation(async (args: any) => {
      const customerId = args?.payload?.stripe_customer_id as string;
      const identifier = args?.identifier as string | undefined;
      settledRun2.push({ customerId, identifier });
      return { id: "me_2" };
    });
    await handleCloudUsageMeteringJob(fakeJob);

    // For every identifier that succeeded in run 1, run 2 sends the same one
    // again. Stripe keeps identifiers unique for at least 24h, so the resend
    // is a no-op instead of a second charge, which is the bug this catches.
    const run1Identifiers = new Set(successfulRun1.map((s) => s.identifier));
    const run2IdentifiersForBilledCustomer = settledRun2
      .filter((s) => s.customerId === billedCustomer)
      .map((s) => s.identifier);

    expect(run2IdentifiersForBilledCustomer.length).toBeGreaterThan(0);
    for (const identifier of run2IdentifiersForBilledCustomer) {
      expect(run1Identifiers.has(identifier)).toBe(true);
    }
  });
});
