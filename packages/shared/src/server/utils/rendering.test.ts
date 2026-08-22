import { describe, it, expect } from "vitest";
import { env } from "../../env";
import { applyInputOutputRendering } from "./rendering";

describe("applyInputOutputRendering", () => {
  it("truncates at LANGFUSE_SERVER_SIDE_IO_CHAR_LIMIT when charLimit is not set", () => {
    const limit = env.LANGFUSE_SERVER_SIDE_IO_CHAR_LIMIT;
    const io = "x".repeat(limit + 1000);

    const result = applyInputOutputRendering(io, {
      truncated: true,
      shouldJsonParse: false,
    });

    expect(result).toBe("x".repeat(limit) + "...[truncated]");
  });

  it("uses the charLimit override instead of the env default when provided", () => {
    // Regression test: verbosity "compact" (per-row table cell preview)
    // needs a much larger cap than "truncated" so it doesn't cut off the
    // tail of real conversations, while still bounding pathological blobs.
    const limit = env.LANGFUSE_SERVER_SIDE_IO_CHAR_LIMIT;
    const bigLimit = limit + 5000;
    const io = "x".repeat(bigLimit + 1000);

    const result = applyInputOutputRendering(io, {
      truncated: true,
      shouldJsonParse: false,
      charLimit: bigLimit,
    });

    expect(result).toBe("x".repeat(bigLimit) + "...[truncated]");
  });

  it("does not truncate when io is within the charLimit override", () => {
    const io = "x".repeat(500);

    const result = applyInputOutputRendering(io, {
      truncated: true,
      shouldJsonParse: false,
      charLimit: 20_000,
    });

    expect(result).toBe(io);
  });
});
