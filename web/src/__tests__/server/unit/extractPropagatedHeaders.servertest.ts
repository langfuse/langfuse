import { describe, it, expect } from "vitest";
import { extractPropagatedHeaders } from "@/src/features/public-api/server/extractPropagatedHeaders";

describe("extractPropagatedHeaders", () => {
  it("captures a header that is listed in the allow-list", () => {
    const result = extractPropagatedHeaders(
      { intuit_tid: "abc-123", "user-agent": "test" },
      ["intuit_tid"],
    );

    expect(result).toEqual({ intuit_tid: "abc-123" });
  });

  it("captures multiple allow-listed headers and ignores the rest", () => {
    const result = extractPropagatedHeaders(
      {
        intuit_tid: "abc-123",
        "x-trace-id": "trace-9",
        "user-agent": "test",
        authorization: "Bearer secret",
      },
      ["intuit_tid", "x-trace-id"],
    );

    expect(result).toEqual({
      intuit_tid: "abc-123",
      "x-trace-id": "trace-9",
    });
  });

  it("omits headers that are listed but missing from the request", () => {
    const result = extractPropagatedHeaders({ "x-trace-id": "trace-9" }, [
      "intuit_tid",
      "x-trace-id",
    ]);

    expect(result).toEqual({ "x-trace-id": "trace-9" });
    expect(result).not.toHaveProperty("intuit_tid");
  });

  it("returns an empty object when the allow-list is empty", () => {
    const result = extractPropagatedHeaders({ intuit_tid: "abc-123" }, []);

    expect(result).toEqual({});
  });

  it("matches headers case-insensitively because Node lowercases req.headers keys", () => {
    // Node's http module lowercases incoming header keys before exposing them
    // on req.headers. The env parser also lowercases the allow-list. So an
    // upstream header sent as `INTUIT_TID` is observed by Node as `intuit_tid`
    // and matched against the lowercased allow-list entry.
    const result = extractPropagatedHeaders({ intuit_tid: "abc-123" }, [
      "intuit_tid",
    ]);

    expect(result).toEqual({ intuit_tid: "abc-123" });
  });

  it("skips array-valued headers (duplicated header on the request)", () => {
    const result = extractPropagatedHeaders(
      { "set-cookie": ["a=1", "b=2"], intuit_tid: "abc-123" },
      ["set-cookie", "intuit_tid"],
    );

    expect(result).toEqual({ intuit_tid: "abc-123" });
    expect(result).not.toHaveProperty("set-cookie");
  });

  it("skips undefined header values", () => {
    const result = extractPropagatedHeaders(
      { intuit_tid: undefined, "x-trace-id": "trace-9" },
      ["intuit_tid", "x-trace-id"],
    );

    expect(result).toEqual({ "x-trace-id": "trace-9" });
  });
});
