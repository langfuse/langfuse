/**
 * warnOnUsageTotalMismatch must stay silent for OTEL usage details that
 * OtelIngestionProcessor normalized into mutually exclusive buckets (mapping
 * pinned in web/src/__tests__/server/api/otel/otelMapping.servertest.ts) and
 * still fire for the additive interpretation of the same payload.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const { recordIncrementMock } = vi.hoisted(() => ({
  recordIncrementMock: vi.fn(),
}));

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const mod =
    await importOriginal<typeof import("@langfuse/shared/src/server")>();
  return {
    ...mod,
    recordIncrement: recordIncrementMock,
  };
});

import { logger } from "@langfuse/shared/src/server";
import { IngestionService } from "../services/IngestionService";

const MISMATCH_METRIC = "langfuse.ingestion.usage_details.total_mismatch";

const createService = () =>
  // warnOnUsageTotalMismatch touches none of the constructor dependencies.
  new IngestionService(null as any, null as any, null as any, null as any);

const callWarn = (usageDetails: Record<string, unknown>) =>
  (createService() as any).warnOnUsageTotalMismatch(
    usageDetails,
    { id: "test-observation", project_id: "test-project" },
    "events",
  );

describe("warnOnUsageTotalMismatch with OTEL-normalized usage details", () => {
  beforeEach(() => {
    recordIncrementMock.mockClear();
    // Bypass the 60s warn-log rate limit so logger assertions are deterministic.
    (IngestionService as any).lastUsageTotalMismatchLogAt = 0;
  });

  it("does not fire for exclusive buckets summing to the explicit total", () => {
    const warnSpy = vi.spyOn(logger, "warn");

    // OpenInference completion (1746) inclusive of reasoning (1680), after
    // normalization: output holds the 66-token remainder.
    callWarn({
      input: 1473,
      output: 66,
      output_reasoning_tokens: 1680,
      total: 3219,
    });

    expect(recordIncrementMock).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("fires for the additive interpretation of the same payload (control)", () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => logger);

    // Reasoning treated as an extra bucket on top of the inclusive output:
    // 1473 + 1746 + 1680 = 4899 > 3219.
    callWarn({
      input: 1473,
      output: 1746,
      output_reasoning_tokens: 1680,
      total: 3219,
    });

    expect(recordIncrementMock).toHaveBeenCalledWith(MISMATCH_METRIC, 1, {
      write_path: "events",
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("exceeds provided total"),
      expect.objectContaining({ providedTotal: 3219, bucketSum: 4899 }),
    );
    warnSpy.mockRestore();
  });
});
