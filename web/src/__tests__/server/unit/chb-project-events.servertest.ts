import type * as SharedServer from "@langfuse/shared/src/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const EVENT_BUS_ARN =
  "arn:aws:events:eu-central-1:720474339533:event-bus/control-plane-events";

const mocks = vi.hoisted(() => ({
  env: {
    NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: "EU" as string | undefined,
    CLICKHOUSE_BILLING_EVENT_BUS_ARN:
      "arn:aws:events:eu-central-1:720474339533:event-bus/control-plane-events" as
        | string
        | undefined,
  },
  findOrg: vi.fn(),
  findProjects: vi.fn(),
  send: vi.fn(),
  recordIncrement: vi.fn(),
  // Plain array, deliberately not reset between tests: the client is a lazy
  // singleton, so only whichever test publishes first constructs one.
  clientRegions: [] as (string | undefined)[],
}));

vi.mock("@/src/env.mjs", () => ({ env: mocks.env }));

// Classes, not vi.fn(...): both of these are invoked with `new`, and an arrow
// implementation is not constructible.
vi.mock("@aws-sdk/client-eventbridge", () => ({
  EventBridgeClient: class {
    send = mocks.send;
    constructor(config: { region?: string }) {
      mocks.clientRegions.push(config?.region);
    }
  },
  PutEventsCommand: class {
    constructor(public input: unknown) {}
  },
}));

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: {
    organization: { findUnique: mocks.findOrg },
    project: { findMany: mocks.findProjects },
  },
}));

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const actual = await importOriginal<typeof SharedServer>();

  return {
    ...actual,
    recordIncrement: mocks.recordIncrement,
  };
});

import {
  backfillChbProjectEvents,
  emitChbProjectEvent,
  sendChbProjectEvent,
} from "@/src/ee/features/billing/server/chb/chbProjectEvents";
import { logger } from "@langfuse/shared/src/server";

const loggerError = vi
  .spyOn(logger, "error")
  .mockImplementation((() => {}) as never);

const ORG_ID = "org-1";
const PROJECT_ID = "project-1";
// Must be a real v4 uuid: cloudConfigSchema uuid-validates the CHB org id and
// parseDbOrg nulls the whole cloudConfig on a parse failure.
const CHB_ORG_ID = "3f7c1b0a-2d5e-4c8b-9a1f-8e6d4c2b1a09";

const orgRow = (cloudConfig: unknown) => ({
  id: ORG_ID,
  name: "Org",
  cloudConfig,
});

// Every entry published, flattened across calls and across each call's batch.
const publishedEntries = () =>
  mocks.send.mock.calls.flatMap(([command]) => command.input.Entries);

const publishedDetails = () =>
  publishedEntries().map((entry) => JSON.parse(entry.Detail));

// emitChbProjectEvent is deliberately fire-and-forget, and the retry wrapper
// schedules its attempts on timers, so tests poll for the effect instead of
// awaiting the call.
const waitFor = (assertion: () => void) =>
  vi.waitFor(assertion, { timeout: 5_000, interval: 10 });

describe("chbProjectEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "EU";
    mocks.env.CLICKHOUSE_BILLING_EVENT_BUS_ARN = EVENT_BUS_ARN;
    mocks.send.mockResolvedValue({ FailedEntryCount: 0 });
    mocks.findProjects.mockResolvedValue([]);
  });

  it("publishes the event envelope for a CHB-billed org", async () => {
    mocks.findOrg.mockResolvedValue(
      orgRow({ clickhouse: { organizationId: CHB_ORG_ID } }),
    );

    emitChbProjectEvent({
      type: "LANGFUSE_PROJECT_CREATED",
      orgId: ORG_ID,
      projectId: PROJECT_ID,
    });
    await waitFor(() => expect(mocks.send).toHaveBeenCalledTimes(1));

    const [entry] = publishedEntries();
    expect(entry.EventBusName).toBe(EVENT_BUS_ARN);
    // CHB's bus policy whitelists event types by detail-type, so the type must
    // be here and not only inside Detail.
    expect(entry.DetailType).toBe("LANGFUSE_PROJECT_CREATED");
    expect(entry.Source).toBe("langfuse");
    // The event carries CHB's organization id, not ours -- CHB's registry is
    // keyed by its own org id.
    const detail = JSON.parse(entry.Detail);
    expect(detail).toMatchObject({
      type: "LANGFUSE_PROJECT_CREATED",
      organizationId: CHB_ORG_ID,
      projectId: PROJECT_ID,
      // Where this deployment runs: the provider region it lives in plus our
      // own cell name, lowercased.
      cloudProvider: "aws",
      region: "eu-west-1",
      cell: "eu",
    });
    expect(detail).not.toHaveProperty("regionId");
  });

  // CHB locates a deployment by provider region plus cell, not by our cell
  // name alone. HIPAA and US share us-west-2, so the cell is what still tells
  // them apart.
  it.each([
    ["US", "us-west-2", "us"],
    ["EU", "eu-west-1", "eu"],
    ["HIPAA", "us-west-2", "hipaa"],
    ["JP", "ap-northeast-1", "jp"],
    ["STAGING", "eu-west-1", "staging"],
  ])("locates cell %s in %s", async (cloudRegion, awsRegion, cell) => {
    mocks.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = cloudRegion;

    await sendChbProjectEvent({
      type: "LANGFUSE_PROJECT_CREATED",
      chbOrganizationId: CHB_ORG_ID,
      projectId: PROJECT_ID,
    });

    expect(publishedDetails()[0]).toMatchObject({
      cloudProvider: "aws",
      region: awsRegion,
      cell,
    });
  });

  // CHB's buses sit in their own regions, which never match ours; the ARN is
  // the only place that region appears.
  it("targets the bus region parsed from the ARN", async () => {
    mocks.findOrg.mockResolvedValue(
      orgRow({ clickhouse: { organizationId: CHB_ORG_ID } }),
    );

    await sendChbProjectEvent({
      type: "LANGFUSE_PROJECT_CREATED",
      chbOrganizationId: CHB_ORG_ID,
      projectId: PROJECT_ID,
    });

    expect(mocks.clientRegions).toContain("eu-central-1");
  });

  it("does not emit for an org without CHB state", async () => {
    mocks.findOrg.mockResolvedValue(
      orgRow({ stripe: { customerId: "cus_1" } }),
    );

    emitChbProjectEvent({
      type: "LANGFUSE_PROJECT_CREATED",
      orgId: ORG_ID,
      projectId: PROJECT_ID,
    });
    await waitFor(() => expect(mocks.findOrg).toHaveBeenCalled());

    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("swallows delivery failures and records them", async () => {
    mocks.findOrg.mockResolvedValue(
      orgRow({ clickhouse: { organizationId: CHB_ORG_ID } }),
    );
    mocks.send.mockRejectedValue(new Error("ECONNRESET"));

    // Must not reject: project create/delete latency and success are unaffected
    // by the billing signal.
    expect(() =>
      emitChbProjectEvent({
        type: "LANGFUSE_PROJECT_DELETED",
        orgId: ORG_ID,
        projectId: PROJECT_ID,
      }),
    ).not.toThrow();

    await waitFor(() =>
      expect(mocks.recordIncrement).toHaveBeenCalledWith(
        "langfuse.billing_events.emit_failed",
        1,
        {
          unit: "events",
          source: "request",
          // A lost delete has to be separable from a lost create on the alert.
          event_type: "LANGFUSE_PROJECT_DELETED",
        },
      ),
    );
    expect(loggerError).toHaveBeenCalled();
  });

  // PutEvents answers 200 with a per-entry failure when the bus rejects an
  // event, so a naive "it resolved" check would treat a rejected event as sent.
  it("treats a failed entry in a 200 response as a failure", async () => {
    mocks.send.mockResolvedValue({
      FailedEntryCount: 1,
      Entries: [
        {
          ErrorCode: "NotAuthorizedForSourceException",
          ErrorMessage: "denied",
        },
      ],
    });

    await expect(
      sendChbProjectEvent({
        type: "LANGFUSE_PROJECT_CREATED",
        chbOrganizationId: CHB_ORG_ID,
        projectId: PROJECT_ID,
      }),
    ).rejects.toThrow("NotAuthorizedForSourceException");
  });

  it("throws from the awaited send path when the event bus is unconfigured", async () => {
    mocks.env.CLICKHOUSE_BILLING_EVENT_BUS_ARN = undefined;

    await expect(
      sendChbProjectEvent({
        type: "LANGFUSE_PROJECT_CREATED",
        chbOrganizationId: CHB_ORG_ID,
        projectId: PROJECT_ID,
      }),
    ).rejects.toThrow("CHB event bus is not configured");
    expect(mocks.send).not.toHaveBeenCalled();
  });

  describe("backfillChbProjectEvents", () => {
    it("sends CREATED for every existing project once the org has checked out", async () => {
      mocks.findOrg.mockResolvedValue(
        orgRow({ clickhouse: { organizationId: CHB_ORG_ID } }),
      );
      mocks.findProjects.mockResolvedValue([
        { id: "project-a" },
        { id: "project-b" },
      ]);

      await expect(
        backfillChbProjectEvents({ orgId: ORG_ID }),
      ).resolves.toEqual({ sent: 2, failed: 0 });

      // Soft-deleted projects must stay out of the backfill: CHB would start
      // metering a project the org can no longer see.
      expect(mocks.findProjects).toHaveBeenCalledWith({
        where: { orgId: ORG_ID, deletedAt: null },
        select: { id: true },
      });
      expect(publishedDetails().map((detail) => detail.projectId)).toEqual([
        "project-a",
        "project-b",
      ]);
      // Batched: both projects ride one PutEvents call, not one call each.
      expect(mocks.send).toHaveBeenCalledTimes(1);
      expect(publishedEntries()[0].DetailType).toBe("LANGFUSE_PROJECT_CREATED");
      expect(publishedDetails()[0]).toMatchObject({
        organizationId: CHB_ORG_ID,
      });
    });

    // The whole point of the checkout-time backfill: projects are not synced
    // before the org carries a CHB organization id.
    it("sends nothing for an org that has not checked out", async () => {
      mocks.findOrg.mockResolvedValue(
        orgRow({ stripe: { customerId: "cus_1" } }),
      );
      mocks.findProjects.mockResolvedValue([{ id: "project-a" }]);

      await expect(
        backfillChbProjectEvents({ orgId: ORG_ID }),
      ).resolves.toEqual({ sent: 0, failed: 0 });

      expect(mocks.findProjects).not.toHaveBeenCalled();
      expect(mocks.send).not.toHaveBeenCalled();
    });

    // PutEvents fails per entry, so a batch can come back half-rejected. The
    // rejected entry must be the only one counted lost, and the only one
    // retried -- resending the whole batch would duplicate what already landed.
    it("counts only the rejected entry of a partially failed batch", async () => {
      mocks.findOrg.mockResolvedValue(
        orgRow({ clickhouse: { organizationId: CHB_ORG_ID } }),
      );
      mocks.findProjects.mockResolvedValue([
        { id: "project-a" },
        { id: "project-b" },
      ]);
      mocks.send.mockImplementation((command) => {
        const results = command.input.Entries.map(
          (entry: { Detail: string }) =>
            JSON.parse(entry.Detail).projectId === "project-a"
              ? { ErrorCode: "InternalException" }
              : { EventId: "ok" },
        );
        return Promise.resolve({
          FailedEntryCount: results.filter(
            (result: { ErrorCode?: string }) => result.ErrorCode,
          ).length,
          Entries: results,
        });
      });

      await expect(
        backfillChbProjectEvents({ orgId: ORG_ID }),
      ).resolves.toEqual({ sent: 1, failed: 1 });

      // Retry #2 and #3 carry only project-a; project-b is not resent.
      expect(
        mocks.send.mock.calls
          .slice(1)
          .flatMap(([command]) => command.input.Entries)
          .map(
            (entry: { Detail: string }) => JSON.parse(entry.Detail).projectId,
          ),
      ).toEqual(["project-a", "project-a"]);

      expect(mocks.recordIncrement).toHaveBeenCalledWith(
        "langfuse.billing_events.emit_failed",
        1,
        {
          unit: "events",
          source: "backfill",
          event_type: "LANGFUSE_PROJECT_CREATED",
        },
      );
      expect(loggerError).toHaveBeenCalled();
    });

    // A failed backfill must never fail checkout.
    it("does not throw when the org lookup itself fails", async () => {
      mocks.findOrg.mockRejectedValue(new Error("postgres down"));

      await expect(
        backfillChbProjectEvents({ orgId: ORG_ID }),
      ).resolves.toEqual({ sent: 0, failed: 0 });
      expect(loggerError).toHaveBeenCalled();
    });
  });
});
