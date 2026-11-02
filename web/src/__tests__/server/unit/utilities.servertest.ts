const { validateOutboundUrlHostMock } = vi.hoisted(() => ({
  validateOutboundUrlHostMock:
    vi.fn<(options: { url: URL }) => Promise<void>>(),
}));

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const actual = await importOriginal();

  return {
    ...(actual as object),
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    validateOutboundUrlHost: validateOutboundUrlHostMock,
  };
});

import {
  isValidAndSecureUrl,
  isValidImageUrl,
} from "@/src/server/api/routers/utilities";

const fetchMock = vi.fn<typeof fetch>();
vi.stubGlobal("fetch", fetchMock);

describe("utilities image URL validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateOutboundUrlHostMock.mockImplementation(async ({ url }) => {
      if (url.hostname === "169.254.169.254") {
        throw new Error("Blocked IP address detected");
      }
    });
  });

  it("rejects image URLs that redirect to blocked IP literals", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { Location: "https://169.254.169.254/latest/meta-data/" },
      }),
    );

    await expect(
      isValidImageUrl("https://attacker.example.com/image.png"),
    ).resolves.toBe(false);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "HEAD",
      redirect: "manual",
    });
  });

  it("rejects pre-signed S3 URLs that redirect to blocked IP literals", async () => {
    const s3Url =
      "https://bucket.s3.amazonaws.com/image.png?X-Amz-Signature=signature";

    fetchMock.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { Location: "https://169.254.169.254/latest/meta-data/" },
      }),
    );

    await expect(isValidImageUrl(s3Url)).resolves.toBe(false);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "HEAD",
      redirect: "manual",
    });
  });

  it("follows redirects after validating each target", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { Location: "https://images.example.com/final.png" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 200,
          headers: { "content-type": "image/png" },
        }),
      );

    await expect(
      isValidImageUrl("https://attacker.example.com/image.png"),
    ).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(validateOutboundUrlHostMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.objectContaining({ hostname: "attacker.example.com" }),
      }),
    );
    expect(validateOutboundUrlHostMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.objectContaining({ hostname: "images.example.com" }),
      }),
    );
  });

  it("rejects URLs that fail shared outbound host validation", async () => {
    validateOutboundUrlHostMock.mockRejectedValueOnce(
      new Error("Blocked IP address detected"),
    );

    await expect(
      isValidAndSecureUrl("https://attacker.example.com/image.png"),
    ).resolves.toBe(false);
  });
});
