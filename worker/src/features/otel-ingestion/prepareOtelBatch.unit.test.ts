import { beforeEach, describe, expect, it, vi } from "vitest";

const nativeMocks = vi.hoisted(() => ({
  validateOtelJson: vi.fn(),
}));
const maskingMocks = vi.hoisted(() => ({
  applyIngestionMasking: vi.fn(),
}));

vi.mock("@langfuse/native", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@langfuse/native")>();
  nativeMocks.validateOtelJson.mockImplementation(actual.validateOtelJson);
  return { ...actual, validateOtelJson: nativeMocks.validateOtelJson };
});

vi.mock("@langfuse/shared/src/server", () => ({
  logger: { warn: vi.fn() },
  recordDistribution: vi.fn(),
  recordIncrement: vi.fn(),
}));

vi.mock("@langfuse/shared/src/server/ee/ingestionMasking", () => ({
  applyIngestionMasking: maskingMocks.applyIngestionMasking,
}));

import { prepareOtelBatch } from "./prepareOtelBatch";

describe("prepareOtelBatch native input boundary", { retry: 0 }, () => {
  beforeEach(() => {
    nativeMocks.validateOtelJson.mockClear();
    maskingMocks.applyIngestionMasking.mockImplementation(
      async (params: { data: unknown }) => ({
        success: true,
        data: params.data,
        masked: false,
      }),
    );
  });

  it("sends the validated original bytes to masking", async () => {
    const original = Buffer.from('{ "value": "🔥" }');
    const batch = { dispose: vi.fn() };
    const validated = {
      normalizedBytes: vi.fn(() => undefined),
      extract: vi.fn().mockResolvedValue(batch),
      dispose: vi.fn().mockResolvedValue(undefined),
    };
    nativeMocks.validateOtelJson.mockResolvedValue(validated);
    const bodies: Buffer[] = [];
    maskingMocks.applyIngestionMasking.mockImplementation(
      async (
        params: { data: { bytes: Buffer } },
        _env: unknown,
        transport: { body: (data: { bytes: Buffer }) => Uint8Array },
      ) => {
        bodies.push(Buffer.from(transport.body(params.data)));
        return { success: true, data: params.data, masked: false };
      },
    );

    await expect(
      prepareOtelBatch({
        bytes: original,
        projectId: "project-id",
        extractMedia: true,
      }),
    ).resolves.toEqual({ batch });

    expect(bodies).toEqual([original]);
    expect(validated.extract).toHaveBeenCalledWith(true);
  });

  it("does not fall back to a second TypeScript processing path", async () => {
    const error = Object.assign(
      new Error("native implementation changed its explanation"),
      { code: "ERR_OTEL_INVALID_JSON" },
    );
    nativeMocks.validateOtelJson.mockRejectedValueOnce(error);

    await expect(
      prepareOtelBatch({
        bytes: Buffer.from("{}"),
        projectId: "project-id",
        extractMedia: false,
      }),
    ).rejects.toBe(error);
  });
});
