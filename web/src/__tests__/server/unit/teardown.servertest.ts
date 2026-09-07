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

  it("disconnects an existing Redis connection", async () => {
    const disconnect = vi.fn();
    vi.stubGlobal("redis", { status: "ready", disconnect });

    await teardown();

    expect(disconnect).toHaveBeenCalledOnce();
  });

  it.each(["end", "close"])(
    "does not disconnect Redis again when its status is %s",
    async (status) => {
      const disconnect = vi.fn();
      vi.stubGlobal("redis", { status, disconnect });

      await teardown();

      expect(disconnect).not.toHaveBeenCalled();
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
    let notifyCloseStarted!: () => void;
    const closeStarted = new Promise<void>((resolve) => {
      notifyCloseStarted = resolve;
    });
    vi.spyOn(client, "close").mockImplementation(() => {
      notifyCloseStarted();
      return closed;
    });
    const cleanupFinished = vi.fn();

    const cleanup = teardown().then(cleanupFinished);
    await closeStarted;
    expect(cleanupFinished).not.toHaveBeenCalled();
    finishClose();
    await cleanup;

    expect(cleanupFinished).toHaveBeenCalledOnce();
  });

  it("closes ClickHouse clients created through the shared server exports", async () => {
    const { clickhouseClient } = await vi.importActual<typeof SharedServer>(
      "@langfuse/shared/src/server",
    );
    const client = clickhouseClient();
    const close = vi.spyOn(client, "close").mockResolvedValue();

    await teardown();

    expect(close).toHaveBeenCalledOnce();
  });

  it("leaves resources open for later files in the shared-context project", async () => {
    const disconnect = vi.fn();
    vi.stubGlobal("redis", { status: "ready", disconnect });
    vi.stubEnv("VITEST_SHARED_CONTEXT", "1");
    let afterAllHook!: () => Promise<void>;
    vi.stubGlobal("afterAll", (hook: () => Promise<void>) => {
      afterAllHook = hook;
    });
    vi.resetModules();
    await import("../../after-teardown");

    await afterAllHook();

    expect(disconnect).not.toHaveBeenCalled();
  });
});
