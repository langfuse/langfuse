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

describe(
  "prepareOtelBatch native representation fallback",
  { retry: 0 },
  () => {
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

    it("falls back for an embedded provider with a lone surrogate", async () => {
      const embedded = JSON.stringify({
        type: "file",
        mediaType: "image/png",
        data: "aGk=",
        note: "\ud800",
      });
      const spans = [
        {
          resource: { attributes: [] },
          scopeSpans: [
            {
              scope: { name: "scope" },
              spans: [
                {
                  traceId: "trace",
                  spanId: "span",
                  attributes: [
                    { key: "input", value: { stringValue: embedded } },
                  ],
                },
              ],
            },
          ],
        },
      ];

      await expect(
        prepareOtelBatch({
          bytes: Buffer.from(JSON.stringify(spans)),
          projectId: "project-id",
          extractMedia: true,
        }),
      ).resolves.toEqual({ spans });
    });

    it("uses the native unsupported code instead of matching error wording", async () => {
      const spans = [{ resourceSpans: [] }];
      const error = Object.assign(
        new Error("native implementation changed its explanation"),
        { code: "ERR_OTEL_UNSUPPORTED" },
      );
      nativeMocks.validateOtelJson.mockRejectedValueOnce(error);

      await expect(
        prepareOtelBatch({
          bytes: Buffer.from(JSON.stringify(spans)),
          projectId: "project-id",
          extractMedia: false,
        }),
      ).resolves.toEqual({ spans });
    });
  },
);
