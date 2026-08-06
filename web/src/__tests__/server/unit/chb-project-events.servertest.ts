import type * as SharedServer from "@langfuse/shared/src/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: {
    NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: "eu" as string | undefined,
    CLICKHOUSE_BILLING_EVENT_BUS_URL: "https://chb.example.com/events" as
      | string
      | undefined,
    CLICKHOUSE_BILLING_SERVICE_TOKEN: "chb-token" as string | undefined,
  },
  findOrg: vi.fn(),
  fetchWithSecureRedirects: vi.fn(),
  recordIncrement: vi.fn(),
}));

vi.mock("@/src/env.mjs", () => ({ env: mocks.env }));

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: { organization: { findUnique: mocks.findOrg } },
}));

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const actual = await importOriginal<typeof SharedServer>();

  return {
    ...actual,
    fetchWithSecureRedirects: mocks.fetchWithSecureRedirects,
    recordIncrement: mocks.recordIncrement,
  };
});

import {
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

// emitChbProjectEvent is deliberately fire-and-forget, and the retry wrapper
// schedules its attempts on timers, so tests poll for the effect instead of
// awaiting the call.
const waitFor = (assertion: () => void) =>
  vi.waitFor(assertion, { timeout: 5_000, interval: 10 });

describe("chbProjectEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.CLICKHOUSE_BILLING_EVENT_BUS_URL =
      "https://chb.example.com/events";
    mocks.env.CLICKHOUSE_BILLING_SERVICE_TOKEN = "chb-token";
    mocks.fetchWithSecureRedirects.mockResolvedValue({
      response: { ok: true, status: 200 },
    });
  });

  it("posts the event envelope for a CHB-billed org", async () => {
    mocks.findOrg.mockResolvedValue(
      orgRow({ clickhouse: { organizationId: CHB_ORG_ID } }),
    );

    emitChbProjectEvent({
      type: "LANGFUSE_PROJECT_CREATED",
      orgId: ORG_ID,
      projectId: PROJECT_ID,
    });
    await waitFor(() =>
      expect(mocks.fetchWithSecureRedirects).toHaveBeenCalledTimes(1),
    );

    const [url, options] = mocks.fetchWithSecureRedirects.mock.calls[0];
    expect(url).toBe("https://chb.example.com/events");
    expect(options.headers.authorization).toBe("Bearer chb-token");
    // The event carries CHB's organization id, not ours -- CHB's registry is
    // keyed by its own org id.
    expect(JSON.parse(options.body)).toMatchObject({
      type: "LANGFUSE_PROJECT_CREATED",
      organizationId: CHB_ORG_ID,
      projectId: PROJECT_ID,
      regionId: "eu",
    });
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

    expect(mocks.fetchWithSecureRedirects).not.toHaveBeenCalled();
  });

  it("swallows delivery failures and records them", async () => {
    mocks.findOrg.mockResolvedValue(
      orgRow({ clickhouse: { organizationId: CHB_ORG_ID } }),
    );
    mocks.fetchWithSecureRedirects.mockRejectedValue(new Error("ECONNRESET"));

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
        { unit: "events" },
      ),
    );
    expect(loggerError).toHaveBeenCalled();
  });

  it("throws from the awaited send path when the event bus is unconfigured", async () => {
    mocks.env.CLICKHOUSE_BILLING_EVENT_BUS_URL = undefined;

    await expect(
      sendChbProjectEvent({
        type: "LANGFUSE_PROJECT_CREATED",
        chbOrganizationId: CHB_ORG_ID,
        projectId: PROJECT_ID,
      }),
    ).rejects.toThrow("CHB event bus is not configured");
    expect(mocks.fetchWithSecureRedirects).not.toHaveBeenCalled();
  });
});
