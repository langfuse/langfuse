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

  it.each(["unchanged", "masked", "sanitized"] as const)(
    "allows download reuse only for unchanged bytes (%s)",
    async (inputKind) => {
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
        extractMedia: true,
      });
      try {
        expect(prepared.batch?.mediaCount()).toBe(0);
        expect(prepared.sourceUnchanged).toBe(inputKind === "unchanged");
        expect(
          JSON.parse(prepared.batch!.takeJsonBuffer().toString("utf8")),
        ).toEqual({
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
