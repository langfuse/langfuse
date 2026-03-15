import { describe, expect, it } from "vitest";
import { isValidImageUrl } from "@langfuse/shared/src/server";

const MAX_IMAGE_DATA_URL_BYTES = 5 * 1024 * 1024;

const buildBase64Payload = (blocks: number, padding: 0 | 1 | 2): string => {
  const pad = padding === 2 ? "==" : padding === 1 ? "=" : "";
  const totalLength = blocks * 4;
  return `${"A".repeat(totalLength - pad.length)}${pad}`;
};

describe("isValidImageUrl", () => {
  it("accepts a valid data URL", async () => {
    const payload = Buffer.from("hello").toString("base64");
    const url = `data:image/png;base64,${payload}`;

    await expect(isValidImageUrl(url)).resolves.toBe(true);
  });

  it("rejects http URLs", async () => {
    await expect(isValidImageUrl("http://example.com/image.png")).resolves.toBe(
      false,
    );
  });

  it("rejects blocked https URLs", async () => {
    await expect(isValidImageUrl("https://127.0.0.1/image.png")).resolves.toBe(
      false,
    );
  });

  it("rejects empty payloads", async () => {
    await expect(isValidImageUrl("data:image/png;base64,")).resolves.toBe(
      false,
    );
  });

  it("rejects invalid base64 characters", async () => {
    await expect(isValidImageUrl("data:image/png;base64,@@@")).resolves.toBe(
      false,
    );
  });

  it("rejects base64 payloads with invalid length", async () => {
    await expect(isValidImageUrl("data:image/png;base64,A")).resolves.toBe(
      false,
    );
  });

  it("rejects payloads above the size limit", async () => {
    const blocks = Math.floor((MAX_IMAGE_DATA_URL_BYTES + 2) / 3) + 1;
    const payload = buildBase64Payload(blocks, 2);
    const url = `data:image/png;base64,${payload}`;

    await expect(isValidImageUrl(url)).resolves.toBe(false);
  });

  it("accepts payloads at or below the size limit", async () => {
    const blocks = Math.floor((MAX_IMAGE_DATA_URL_BYTES + 2) / 3);
    const payload = buildBase64Payload(blocks, 2);
    const url = `data:image/png;base64,${payload}`;

    await expect(isValidImageUrl(url)).resolves.toBe(true);
  });
});
