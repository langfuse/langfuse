import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { gzipSync } from "zlib";
import { MixpanelClient } from "../features/mixpanel/mixpanelClient";
import type { MixpanelEvent } from "../features/mixpanel/transformers";

describe("MixpanelClient export volume", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("accumulates gzipped on-wire bytes across sendBatch chunks", async () => {
    const client = new MixpanelClient({ projectToken: "t", region: "api" });

    // > batchSize (1000) so flush() splits into two sendBatch chunks.
    const total = 1500;
    const events: MixpanelEvent[] = Array.from(
      { length: total },
      (_, i) =>
        ({
          event: "trace",
          properties: { token: "t", distinct_id: String(i), $insert_id: i },
        }) as unknown as MixpanelEvent,
    );
    events.forEach((e) => client.addEvent(e));

    await client.flush();

    const expected =
      gzipSync(JSON.stringify(events.slice(0, 1000))).length +
      gzipSync(JSON.stringify(events.slice(1000))).length;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(client.getSerializedBytes()).toBe(expected);
  });
});
