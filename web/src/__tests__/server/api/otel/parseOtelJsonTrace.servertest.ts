import { describe, expect, it } from "vitest";

import { parseOtelJsonTrace } from "@/src/features/otel/parseOtelJsonTrace";

describe("parseOtelJsonTrace", () => {
  it("returns actionable guidance for malformed JSON", () => {
    const result = parseOtelJsonTrace(Buffer.from('{"resourceSpans": ['));

    expect(result.success).toBe(false);
    expect(result).toMatchObject({
      error: expect.stringContaining("Failed to parse OTel JSON Trace"),
    });
    expect(result).toMatchObject({
      error: expect.stringContaining("resourceSpans"),
    });
    expect(result).toMatchObject({
      error: expect.stringContaining("Content-Type: application/json"),
    });
  });

  it("requires a top-level resourceSpans array", () => {
    const result = parseOtelJsonTrace(Buffer.from('{"scopeSpans": []}'));

    expect(result).toEqual({
      success: false,
      error:
        "Failed to parse OTel JSON Trace: expected a top-level resourceSpans array in the OTLP JSON payload.",
    });
  });

  it("accepts a valid OTLP JSON trace payload", () => {
    const result = parseOtelJsonTrace(
      Buffer.from(
        JSON.stringify({
          resourceSpans: [
            {
              scopeSpans: [],
            },
          ],
        }),
      ),
    );

    expect(result).toEqual({
      success: true,
      resourceSpans: [{ scopeSpans: [] }],
    });
  });
});
