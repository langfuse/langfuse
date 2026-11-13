import {
  checkLangfuseReachable,
  subscribeToNewsletter,
} from "./newsletterSignup";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const rejectOnAbort: typeof fetch = (_input, init) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
  });

describe("checkLangfuseReachable", () => {
  it("treats an opaque response as reachable", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));

    await expect(checkLangfuseReachable()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://langfuse.com/api/latest-releases",
      expect.objectContaining({
        mode: "no-cors",
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer",
      }),
    );
  });

  it("treats a network error as unreachable", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(checkLangfuseReachable()).resolves.toBe(false);
  });

  it("gives up after 3 seconds", async () => {
    const timeout = new AbortController();
    const timeoutSpy = vi
      .spyOn(AbortSignal, "timeout")
      .mockReturnValue(timeout.signal);
    fetchMock.mockImplementation(rejectOnAbort);

    const result = checkLangfuseReachable();
    timeout.abort(new DOMException("Timed out", "TimeoutError"));

    await expect(result).resolves.toBe(false);
    expect(timeoutSpy).toHaveBeenCalledWith(3_000);
  });
});

describe("subscribeToNewsletter", () => {
  const email = "user@example.com";

  it("posts the address, lists and source and reports a 200 as subscribed", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));

    await expect(
      subscribeToNewsletter({ email, lists: ["product", "oss"] }),
    ).resolves.toBe("subscribed");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://langfuse.com/api/productUpdateSignup",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "omit",
        referrerPolicy: "no-referrer",
      }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({
      email,
      lists: ["product", "oss"],
      source: "self-hosted-onboarding",
    });
    expect(timeoutSpy).toHaveBeenCalledWith(5_000);
  });

  it("reports any other status as failed", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 500 }));

    await expect(
      subscribeToNewsletter({ email, lists: ["product"] }),
    ).resolves.toBe("failed");
  });

  it("reports a network error as failed", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(
      subscribeToNewsletter({ email, lists: ["product"] }),
    ).resolves.toBe("failed");
  });
});
