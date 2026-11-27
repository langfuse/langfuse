import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as SharedServer from "@langfuse/shared/src/server";
import teardown from "../../teardown";

vi.mock("@langfuse/shared/src/server", () => {
  throw new Error("Test cleanup must not load the shared server barrel");
});

describe("server test resource cleanup", () => {
  beforeEach(() => {
    vi.stubGlobal("redis", undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("does not initialize Redis when no test opened it", async () => {
    await teardown();

    expect(globalThis.redis).toBeUndefined();
  });

  it.each(["ready", "end", "close"])(
    "disconnects only an active Redis connection (%s)",
    async (status) => {
      const disconnect = vi.fn();
      vi.stubGlobal("redis", { status, disconnect });

      await teardown();

      expect(disconnect).toHaveBeenCalledTimes(status === "ready" ? 1 : 0);
    },
  );

  it("waits for existing ClickHouse clients to close", async () => {
    const { clickhouseClient } =
      await import("@langfuse/shared/src/server/clickhouse");
    const client = clickhouseClient();
    let finishClose!: () => void;
    const closed = new Promise<void>((resolve) => {
      finishClose = resolve;
    });
    const close = vi.spyOn(client, "close").mockReturnValue(closed);
    const finished = vi.fn();
    const cleanup = teardown().then(finished);

    try {
      await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
      expect(finished).not.toHaveBeenCalled();
    } finally {
      finishClose();
      await cleanup;
    }

    expect(finished).toHaveBeenCalledOnce();
  });

  it("closes clients created through the built shared server export", async () => {
    const actual = await vi.importActual<typeof SharedServer>(
      "@langfuse/shared/src/server",
    );
    try {
      const client = actual.clickhouseClient();
      const close = vi.spyOn(client, "close");

      await teardown();

      expect(close).toHaveBeenCalledOnce();
    } finally {
      actual.redis?.disconnect();
    }
  });

  it("leaves shared-context resources open for later test files", async () => {
    const { clickhouseClient } =
      await import("@langfuse/shared/src/server/clickhouse");
    const disconnect = vi.fn();
    const close = vi.spyOn(clickhouseClient(), "close");
    vi.stubGlobal("redis", { status: "ready", disconnect });
    vi.stubEnv("VITEST_SHARED_CONTEXT", "1");
    let afterAllHook!: () => Promise<void>;
    vi.stubGlobal("afterAll", (hook: () => Promise<void>) => {
      afterAllHook = hook;
    });
    vi.resetModules();
    await import("../../after-teardown");

    try {
      await afterAllHook();

      expect(disconnect).not.toHaveBeenCalled();
      expect(close).not.toHaveBeenCalled();
    } finally {
      await teardown();
    }
  });
});
