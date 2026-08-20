import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { countingFetch } from "../features/posthog/handlePostHogIntegrationProjectJob";

describe("countingFetch (posthog export volume)", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ status: 200 });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("counts V0 and V1 capture bodies, ignores /flags/, and forwards all", async () => {
    const volume = { bytes: 0 };
    const wrapped = countingFetch(volume)!;

    await wrapped("https://app.posthog.com/batch/", {
      method: "POST",
      headers: {},
      body: "abcd",
    });
    expect(volume.bytes).toBe(4);

    await wrapped("https://app.posthog.com/batch/", {
      method: "POST",
      headers: {},
      body: new Blob([new Uint8Array(10)]),
    });
    expect(volume.bytes).toBe(14);

    await wrapped("https://app.posthog.com/i/v1/analytics/events", {
      method: "POST",
      headers: {},
      body: "v1-body",
    });
    expect(volume.bytes).toBe(21);

    // Feature-flag traffic must not be counted as export egress.
    await wrapped("https://app.posthog.com/flags/?v=2", {
      method: "POST",
      headers: {},
      body: "ignored",
    });
    expect(volume.bytes).toBe(21);

    // Every request is still forwarded to the underlying fetch.
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
