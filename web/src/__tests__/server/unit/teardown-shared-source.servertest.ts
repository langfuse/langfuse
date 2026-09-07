import { afterEach, expect, it, vi } from "vitest";
import { env } from "@langfuse/shared/src/env";
import { clickhouseClient } from "@langfuse/shared/src/server";
import teardown from "../../teardown";

afterEach(() => {
  vi.restoreAllMocks();
});

it("closes shared-source clients through the same module identity", async () => {
  const client = clickhouseClient({ url: env.CLICKHOUSE_URL });
  const close = vi.spyOn(client, "close").mockResolvedValue();

  await teardown();

  expect(close).toHaveBeenCalledOnce();
});
