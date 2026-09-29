import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createMany: vi.fn(),
  queueAdd: vi.fn(),
  loggerInfo: vi.fn(),
  shouldSkipDeletionFor: vi.fn(),
}));

vi.mock("../db", () => ({
  prisma: { pendingDeletion: { createMany: mocks.createMany } },
}));

vi.mock("./redis/traceDelete", () => ({
  TraceDeleteQueue: { getInstance: () => ({ add: mocks.queueAdd }) },
}));

vi.mock("./logger", () => ({
  logger: { info: mocks.loggerInfo, warn: vi.fn(), error: vi.fn() },
}));

vi.mock("./deletionGuard", () => ({
  shouldSkipDeletionFor: mocks.shouldSkipDeletionFor,
}));

vi.mock("../env", () => ({
  env: { LANGFUSE_TRACE_DELETE_DELAY_MS: 5000 },
}));

import {
  formatDeletionActor,
  traceDeletionProcessor,
} from "./traceDeletionProcessor";

describe("formatDeletionActor", () => {
  it("prefers the public key for API key actors", () => {
    expect(
      formatDeletionActor({
        type: "API_KEY",
        apiKeyId: "api-key-1",
        publicKey: "pk-lf-test",
      }),
    ).toBe("API key pk-lf-test");
  });

  it("falls back to the api key id when no public key is set", () => {
    expect(
      formatDeletionActor({ type: "API_KEY", apiKeyId: "api-key-1" }),
    ).toBe("API key api-key-1");
  });

  it("formats user actors with their user id", () => {
    expect(formatDeletionActor({ type: "USER", userId: "user-1" })).toBe(
      "user user-1",
    );
  });

  it("marks missing ids as unknown", () => {
    expect(formatDeletionActor({ type: "USER" })).toBe("user unknown");
    expect(formatDeletionActor({ type: "API_KEY" })).toBe("API key unknown");
  });
});

describe("traceDeletionProcessor actor propagation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.shouldSkipDeletionFor.mockResolvedValue(false);
    mocks.createMany.mockResolvedValue({ count: 1 });
    mocks.queueAdd.mockResolvedValue(undefined);
  });

  it("logs the actor and adds it to the queue payload", async () => {
    const actor = {
      type: "API_KEY" as const,
      apiKeyId: "api-key-1",
      publicKey: "pk-lf-test",
    };

    await traceDeletionProcessor("project-1", ["trace-1", "trace-2"], {
      actor,
    });

    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      "Processing trace deletion for 2 traces in project project-1 requested by API key pk-lf-test",
      expect.objectContaining({
        projectId: "project-1",
        traceIds: ["trace-1", "trace-2"],
        actor,
      }),
    );
    expect(mocks.queueAdd).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        payload: {
          projectId: "project-1",
          traceIds: ["trace-1", "trace-2"],
          actor,
        },
      }),
      { delay: 5000 },
    );
  });

  it("keeps the original log message when no actor is passed", async () => {
    await traceDeletionProcessor("project-1", ["trace-1"]);

    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      "Processing trace deletion for 1 traces in project project-1",
      expect.objectContaining({ actor: undefined }),
    );
    expect(mocks.queueAdd).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        payload: expect.objectContaining({ actor: undefined }),
      }),
      { delay: 5000 },
    );
  });
});
