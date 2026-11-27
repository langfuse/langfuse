import { testSignedMediaUrlCors } from "./testSignedMediaUrlCors";

describe("testSignedMediaUrlCors", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests one byte without browser credentials and closes the body", async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    const fetchMock = vi.fn().mockResolvedValue({
      body: { cancel },
      ok: true,
      status: 206,
    });
    vi.stubGlobal("fetch", fetchMock);

    await testSignedMediaUrlCors("https://signed.example/object");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://signed.example/object",
      expect.objectContaining({
        credentials: "omit",
        headers: { Range: "bytes=0-0" },
        mode: "cors",
        referrerPolicy: "no-referrer",
      }),
    );
    expect(cancel).toHaveBeenCalledOnce();
  });
});
