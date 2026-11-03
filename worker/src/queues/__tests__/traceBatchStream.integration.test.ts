import { setTimeout } from "node:timers/promises";
import { describe, expect, it } from "vitest";
import { queryClickhouseStream } from "@langfuse/shared/src/server";

describe("ClickHouse stream backpressure", () => {
  it("allows a paused consumer to finish when its configured idle timeout exceeds the pause", async () => {
    const readWithPause = async (requestTimeoutMs: number) => {
      // A response larger than socket buffers keeps the connection open while
      // the consumer pauses; numbers() avoids creating persistent test data.
      const stream = queryClickhouseStream<{ number: number; payload: string }>(
        {
          query:
            "SELECT number, repeat(toString(number), 1024) AS payload FROM numbers(10000)",
          clickhouseConfigs: { request_timeout: requestTimeoutMs },
          clickhouseSettings: { max_block_size: "256" },
        },
      );
      try {
        expect((await stream.next()).done).toBe(false);
        await setTimeout(1_000);
        let remaining = 0;
        for await (const _row of stream) remaining++;
        return remaining;
      } finally {
        await stream.return(undefined);
      }
    };

    await expect(readWithPause(250)).rejects.toThrow(/aborted|timeout/i);
    await expect(readWithPause(5_000)).resolves.toBe(9_999);
  }, 20_000);
});
