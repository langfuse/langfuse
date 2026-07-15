import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { startSseKeepAlive } from "@/src/features/mcp/server/sseKeepAlive";

const PING_INTERVAL_MS = 30_000;
const MAX_AGE_MS = 900_000;

const makeRes = () => {
  const res = {
    headersSent: true,
    writableEnded: false,
    destroyed: false,
    writes: [] as string[],
    write(chunk: string) {
      res.writes.push(chunk);
      return true;
    },
    end() {
      res.writableEnded = true;
    },
  };
  return res;
};

const start = (
  res: ReturnType<typeof makeRes>,
  isDraining: () => boolean = () => false,
) =>
  startSseKeepAlive({
    res,
    pingIntervalMs: PING_INTERVAL_MS,
    maxConnectionAgeMs: MAX_AGE_MS,
    isDraining,
  });

describe("startSseKeepAlive", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("writes an SSE comment ping every interval", () => {
    const res = makeRes();
    const keepAlive = start(res);

    vi.advanceTimersByTime(PING_INTERVAL_MS * 3);

    expect(res.writes).toEqual([
      ": keep-alive\n\n",
      ": keep-alive\n\n",
      ": keep-alive\n\n",
    ]);
    expect(res.writableEnded).toBe(false);
    keepAlive.stop();
  });

  it("does not write before response headers are sent", () => {
    const res = makeRes();
    res.headersSent = false;
    const keepAlive = start(res);

    vi.advanceTimersByTime(PING_INTERVAL_MS * 2);
    expect(res.writes).toEqual([]);

    res.headersSent = true;
    vi.advanceTimersByTime(PING_INTERVAL_MS);
    expect(res.writes).toEqual([": keep-alive\n\n"]);
    keepAlive.stop();
  });

  it("ends the stream when the process starts draining", () => {
    const res = makeRes();
    let draining = false;
    start(res, () => draining);

    vi.advanceTimersByTime(PING_INTERVAL_MS);
    expect(res.writableEnded).toBe(false);

    draining = true;
    vi.advanceTimersByTime(PING_INTERVAL_MS);
    expect(res.writableEnded).toBe(true);

    // Interval self-stopped: no further writes after end
    const writesAfterEnd = res.writes.length;
    vi.advanceTimersByTime(PING_INTERVAL_MS * 3);
    expect(res.writes.length).toBe(writesAfterEnd);
  });

  it("ends the stream after the max connection age", () => {
    const res = makeRes();
    start(res);

    vi.advanceTimersByTime(MAX_AGE_MS - PING_INTERVAL_MS);
    expect(res.writableEnded).toBe(false);

    vi.advanceTimersByTime(PING_INTERVAL_MS);
    expect(res.writableEnded).toBe(true);
  });

  it("stops itself when the response ended elsewhere (client disconnect)", () => {
    const res = makeRes();
    start(res);

    vi.advanceTimersByTime(PING_INTERVAL_MS);
    expect(res.writes.length).toBe(1);

    res.writableEnded = true; // transport ended the response
    vi.advanceTimersByTime(PING_INTERVAL_MS * 3);
    expect(res.writes.length).toBe(1);
  });

  it("stop() prevents any further activity", () => {
    const res = makeRes();
    const keepAlive = start(res);

    keepAlive.stop();
    vi.advanceTimersByTime(PING_INTERVAL_MS * 5);

    expect(res.writes).toEqual([]);
    expect(res.writableEnded).toBe(false);
  });
});
