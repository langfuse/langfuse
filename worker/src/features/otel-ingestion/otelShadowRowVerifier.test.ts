import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queryClickhouse: vi.fn(),
}));

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@langfuse/shared/src/server")>();
  return { ...actual, queryClickhouse: mocks.queryClickhouse };
});

import {
  drainOtelShadowRowVerifier,
  enqueueOtelShadowRows,
  verifyOtelShadowRows,
  type OtelShadowRowSample,
} from "./otelShadowRowVerifier";

const queryClickhouse =
  mocks.queryClickhouse as unknown as typeof import("@langfuse/shared/src/server").queryClickhouse;

const locator = (
  spanId: string,
  startTime = "2026-11-24 10:00:00.000000",
  traceId = "trace-1",
) => ({
  traceId,
  spanId,
  startTime,
});

const sample = (
  overrides: Partial<OtelShadowRowSample> = {},
): OtelShadowRowSample => ({
  projectId: "project-1",
  fileKey: "otel/project-1/delivery-1.json",
  inputBytes: 128,
  primary: [locator("span-1")],
  shadow: [locator("span-1")],
  ...overrides,
});

describe("otel shadow row verifier contract", () => {
  beforeEach(() => {
    mocks.queryClickhouse.mockReset();
    mocks.queryClickhouse.mockResolvedValue([]);
  });

  afterEach(async () => {
    vi.useRealTimers();
    await drainOtelShadowRowVerifier();
  });

  it("verifies 513 distinct span keys from overlapping batches in two reads", async () => {
    const keys = Array.from({ length: 513 }, (_, i) => locator(String(i)));
    const counts = await verifyOtelShadowRows(
      [
        sample({ primary: keys, shadow: keys.slice(0, 1) }),
        sample({ primary: [], shadow: keys.slice(1) }),
      ],
      queryClickhouse,
    );
    // The last 512 keys got their two acknowledgements from different attempts.
    expect(counts).toEqual({ missing_both: 1, ambiguous: 512 });
    expect(mocks.queryClickhouse).toHaveBeenCalledTimes(2);
  });

  it("keeps a low-traffic batch until the 30-second max age", async () => {
    vi.useFakeTimers();

    enqueueOtelShadowRows(sample());
    expect(mocks.queryClickhouse).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(29_999);
    expect(mocks.queryClickhouse).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(mocks.queryClickhouse).toHaveBeenCalledTimes(1);
  });

  it("makes one read after a staggered 4 MiB group has settled", async () => {
    vi.useFakeTimers();
    enqueueOtelShadowRows(sample({ inputBytes: 2 * 1024 * 1024 }));
    await vi.advanceTimersByTimeAsync(4_000);
    enqueueOtelShadowRows(
      sample({ fileKey: "next-file", inputBytes: 2 * 1024 * 1024 }),
    );
    await vi.advanceTimersByTimeAsync(4_999);
    expect(mocks.queryClickhouse).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(mocks.queryClickhouse).toHaveBeenCalledTimes(1);
    expect(mocks.queryClickhouse.mock.calls[0][0].params.locators).toHaveLength(
      2,
    );
  });

  it("rejects more than the retained locator-record budget", async () => {
    enqueueOtelShadowRows(
      sample({
        primary: Array.from({ length: 16_385 }, (_, index) =>
          locator(`span-${index}`),
        ),
        shadow: [],
        inputBytes: 128,
      }),
    );

    await drainOtelShadowRowVerifier();
    expect(mocks.queryClickhouse).not.toHaveBeenCalled();
  });
});
