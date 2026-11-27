import { describe, expect, it } from "vitest";

import {
  SDK_NAME_HEADER,
  SDK_VERSION_HEADER,
  extractSdkAttributes,
  extractSdkName,
} from "./sdkName";

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
    expect(
      extractSdkName({ [SDK_NAME_HEADER]: "python, javascript" }),
    ).toBeUndefined();
  });

  it("returns canonical SDK name and validated version attributes", () => {
    expect(
      extractSdkAttributes({
        [SDK_NAME_HEADER]: "langfuse-python",
        [SDK_VERSION_HEADER]: "4.8.1rc1",
      }),
    ).toEqual({ sdkName: "python", sdkVersion: "4.8.1rc1" });
  });

  it("keeps a recognized SDK name when its version is invalid", () => {
    expect(
      extractSdkAttributes({
        [SDK_NAME_HEADER]: "javascript",
        [SDK_VERSION_HEADER]: "unbounded-cardinality",
      }),
    ).toEqual({ sdkName: "javascript" });
  });
});
