import { describe, expect, it } from "vitest";

import {
  SDK_NAME_HEADER,
  extractSdkName,
} from "@/src/server/observability/sdkName";

describe("extractSdkName", () => {
  it("canonicalizes first-party SDK names to the ingestion closed set", () => {
    expect(extractSdkName({ [SDK_NAME_HEADER]: "python" })).toBe("python");
    expect(extractSdkName({ [SDK_NAME_HEADER]: "langfuse-python" })).toBe(
      "python",
    );
    expect(extractSdkName({ [SDK_NAME_HEADER]: "JavaScript" })).toBe(
      "javascript",
    );
    expect(extractSdkName({ [SDK_NAME_HEADER]: "ts" })).toBe("javascript");
  });

  it("returns undefined for absent or blank headers", () => {
    expect(extractSdkName({})).toBeUndefined();
    expect(extractSdkName({ [SDK_NAME_HEADER]: "   " })).toBeUndefined();
  });

  it("drops unknown, caller-controlled values to cap cardinality", () => {
    expect(extractSdkName({ [SDK_NAME_HEADER]: "b3d1c0de" })).toBeUndefined();
    // Node comma-joins duplicate headers; the joined value fails the allowlist.
    expect(
      extractSdkName({ [SDK_NAME_HEADER]: "python, javascript" }),
    ).toBeUndefined();
  });
});
