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

  it("counts /batch/ string and Blob bodies, ignores /flags/, forwards all", async () => {
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

    // Feature-flag traffic must not be counted as export egress.
    await wrapped("https://app.posthog.com/flags/?v=2", {
      method: "POST",
      headers: {},
      body: "ignored",
    });
    expect(volume.bytes).toBe(14);

    // Every request is still forwarded to the underlying fetch.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
