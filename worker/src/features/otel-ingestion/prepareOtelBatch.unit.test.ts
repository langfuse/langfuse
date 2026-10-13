import { beforeEach, describe, expect, it, vi } from "vitest";

const nativeMocks = vi.hoisted(() => ({
  validateOtelJson: vi.fn(),
  extractOtelMedia: vi.fn(),
}));
const maskingMocks = vi.hoisted(() => ({
  applyIngestionMasking: vi.fn(),
  isIngestionMaskingEnabled: vi.fn(),
}));

vi.mock("@langfuse/native", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@langfuse/native")>();
  nativeMocks.validateOtelJson.mockImplementation(actual.validateOtelJson);
  nativeMocks.extractOtelMedia.mockImplementation(actual.extractOtelMedia);
  return {
    ...actual,
    validateOtelJson: nativeMocks.validateOtelJson,
    extractOtelMedia: nativeMocks.extractOtelMedia,
  };
});

vi.mock("@langfuse/shared/src/server", () => ({
  logger: { warn: vi.fn() },
  recordDistribution: vi.fn(),
  recordIncrement: vi.fn(),
}));

vi.mock("@langfuse/shared/src/server/ee/ingestionMasking", () => ({
  applyIngestionMasking: maskingMocks.applyIngestionMasking,
  isIngestionMaskingEnabled: maskingMocks.isIngestionMaskingEnabled,
}));

import { parsePreparedOtelBatch, prepareOtelBatch } from "./prepareOtelBatch";

describe("prepareOtelBatch native input boundary", { retry: 0 }, () => {
  beforeEach(() => {
    nativeMocks.validateOtelJson.mockClear();
    nativeMocks.extractOtelMedia.mockClear();
    maskingMocks.isIngestionMaskingEnabled.mockReturnValue(true);
    maskingMocks.applyIngestionMasking.mockImplementation(
      async (params: { data: unknown }) => ({
        success: true,
        data: params.data,
        masked: false,
      }),
    );
  });

  it.each(["unchanged", "masked", "sanitized", "disabled"] as const)(
    "allows download reuse only for unchanged bytes (%s)",
    async (inputKind) => {
      const disabled = inputKind === "disabled";
      const sourceUnchanged = inputKind === "unchanged" || disabled;
      maskingMocks.isIngestionMaskingEnabled.mockReturnValue(!disabled);
      const native =
        await vi.importActual<typeof import("@langfuse/native")>(
          "@langfuse/native",
        );
      nativeMocks.validateOtelJson.mockImplementation(native.validateOtelJson);
      const bytes =
        inputKind === "sanitized"
          ? Buffer.concat([
              Buffer.from('{"note":"'),
              Buffer.from([0xff]),
              Buffer.from('"}'),
            ])
          : Buffer.from('{"note":"original"}');
      if (inputKind === "masked") {
        maskingMocks.applyIngestionMasking.mockImplementation(
          async (_params, _env, transport) => ({
            success: true,
            data: await transport.read(new Response('{"note":"masked"}')),
            masked: true,
          }),
        );
      }
      const prepared = await prepareOtelBatch({
        bytes,
        projectId: "project-id",
        extractMedia: !disabled,
      });
      try {
        if ("error" in prepared) throw new Error("unexpected masking failure");
        expect(prepared.batch?.mediaCount()).toBe(disabled ? undefined : 0);
        expect(nativeMocks.extractOtelMedia).not.toHaveBeenCalled();
        expect(prepared.sourceUnchanged).toBe(sourceUnchanged);
        const parsed = await parsePreparedOtelBatch(prepared, bytes);
        expect(parsed.batch).toBe(sourceUnchanged ? undefined : prepared.batch);
        expect(parsed.resourceSpans).toEqual({
          note:
            inputKind === "sanitized"
              ? "�"
              : inputKind === "masked"
                ? "masked"
                : "original",
        });
      } finally {
        await prepared.batch?.dispose();
      }
    },
  );

  it("rejects malformed JSON after marker-free preparation", async () => {
    maskingMocks.isIngestionMaskingEnabled.mockReturnValue(false);
    const bytes = Buffer.from('{"note":"ordinary"} trailing');
    const prepared = await prepareOtelBatch({
      bytes,
      projectId: "project-id",
      extractMedia: true,
    });
    if ("error" in prepared) throw new Error("unexpected masking failure");
    expect(prepared.batch).toBeUndefined();
    await expect(parsePreparedOtelBatch(prepared, bytes)).rejects.toThrow(
      SyntaxError,
    );
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
