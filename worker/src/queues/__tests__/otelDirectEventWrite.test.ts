import { describe, it, expect } from "vitest";
import {
  checkHeaderBasedDirectWrite,
  checkSdkVersionRequirements,
  getSdkInfoFromResourceSpans,
  type SdkInfo,
} from "../otelIngestionQueue";

describe("checkHeaderBasedDirectWrite", () => {
  it.each<{
    input: Parameters<typeof checkHeaderBasedDirectWrite>[0];
    expected: boolean;
    label: string;
  }>([
    // Python SDK version checks
    {
      input: { sdkName: "python", sdkVersion: "4.0.0" },
      expected: true,
      label: "python 4.0.0 (exact minimum)",
    },
    {
      input: { sdkName: "python", sdkVersion: "4.2.1" },
      expected: true,
      label: "python 4.2.1 (above minimum)",
    },
    {
      input: { sdkName: "python", sdkVersion: "3.9.0" },
      expected: false,
      label: "python 3.9.0 (below minimum)",
    },

    // JS SDK version checks
    {
      input: { sdkName: "javascript", sdkVersion: "5.0.0" },
      expected: true,
      label: "javascript 5.0.0 (exact minimum)",
    },
    {
      input: { sdkName: "javascript", sdkVersion: "5.1.3" },
      expected: true,
      label: "javascript 5.1.3 (above minimum)",
    },
    {
      input: { sdkName: "javascript", sdkVersion: "4.6.0" },
      expected: false,
      label: "javascript 4.6.0 (below minimum)",
    },

    // Pre-release versions (stripped before comparison)
    {
      input: { sdkName: "python", sdkVersion: "4.0.0-rc.1" },
      expected: true,
      label: "python 4.0.0-rc.1 (pre-release at minimum)",
    },
    {
      input: { sdkName: "javascript", sdkVersion: "5.0.0-beta.1" },
      expected: true,
      label: "javascript 5.0.0-beta.1 (pre-release at minimum)",
    },
    {
      input: { sdkName: "python", sdkVersion: "4.1.0-rc.1" },
      expected: true,
      label: "python 4.1.0-rc.1 (pre-release above minimum)",
    },
    {
      input: { sdkName: "python", sdkVersion: "3.9.0-rc.1" },
      expected: false,
      label: "python 3.9.0-rc.1 (pre-release below minimum)",
    },

    // Unknown / missing SDK name
    {
      input: { sdkName: "ruby", sdkVersion: "1.0.0" },
      expected: false,
      label: "unknown SDK name",
    },
    {
      input: { sdkName: "python" },
      expected: false,
      label: "sdkName without sdkVersion",
    },
    {
      input: { sdkVersion: "4.0.0" },
      expected: false,
      label: "sdkVersion without sdkName",
    },

    // Malformed versions
    {
      input: { sdkName: "python", sdkVersion: "not-a-version" },
      expected: false,
      label: "non-semver sdkVersion",
    },
    {
      input: { sdkName: "python", sdkVersion: "" },
      expected: false,
      label: "empty sdkVersion",
    },

    // ingestionVersion
    {
      input: { ingestionVersion: "4" },
      expected: true,
      label: "ingestionVersion '4'",
    },
    {
      input: {
        ingestionVersion: "4",
        sdkName: undefined,
        sdkVersion: undefined,
      },
      expected: true,
      label: "ingestionVersion '4' without SDK headers",
    },
    {
      input: { ingestionVersion: "3" },
      expected: false,
      label: "ingestionVersion '3' (below)",
    },
    {
      input: { ingestionVersion: "1" },
      expected: false,
      label: "ingestionVersion '1' (below)",
    },
    {
      input: { sdkName: "python", sdkVersion: "3.0.0", ingestionVersion: "4" },
      expected: true,
      label: "ingestionVersion '4' overrides old SDK version",
    },

    // No headers
    { input: {}, expected: false, label: "empty input" },
    {
      input: {
        sdkName: undefined,
        sdkVersion: undefined,
        ingestionVersion: undefined,
      },
      expected: false,
      label: "all undefined",
    },
  ])("$label → $expected", ({ input, expected }) => {
    expect(checkHeaderBasedDirectWrite(input)).toBe(expected);
  });
});

describe("checkSdkVersionRequirements (legacy fallback)", () => {
  it.each<{
    sdkInfo: SdkInfo;
    isExperiment: boolean;
    expected: boolean;
    label: string;
  }>([
    {
      sdkInfo: {
        scopeName: "openlit",
        scopeVersion: "3.9.0",
        telemetrySdkLanguage: "python",
      },
      isExperiment: true,
      expected: false,
      label: "non-Langfuse scope name",
    },
    {
      sdkInfo: {
        scopeName: "langfuse-sdk",
        scopeVersion: "3.9.0",
        telemetrySdkLanguage: "python",
      },
      isExperiment: false,
      expected: false,
      label: "experiment batch false",
    },
    {
      sdkInfo: {
        scopeName: "langfuse-sdk",
        scopeVersion: "3.9.0",
        telemetrySdkLanguage: "python",
      },
      isExperiment: true,
      expected: true,
      label: "python 3.9.0 (exact minimum)",
    },
    {
      sdkInfo: {
        scopeName: "langfuse-sdk",
        scopeVersion: "4.4.0",
        telemetrySdkLanguage: "js",
      },
      isExperiment: true,
      expected: true,
      label: "js 4.4.0 (exact minimum)",
    },
  ])("$label → $expected", ({ sdkInfo, isExperiment, expected }) => {
    expect(checkSdkVersionRequirements(sdkInfo, isExperiment)).toBe(expected);
  });
});

describe("getSdkInfoFromResourceSpans (legacy fallback)", () => {
  it.each<{
    input: Parameters<typeof getSdkInfoFromResourceSpans>[0];
    expected: ReturnType<typeof getSdkInfoFromResourceSpans>;
    label: string;
  }>([
    {
      input: {
        resource: {
          attributes: [
            { key: "telemetry.sdk.language", value: { stringValue: "python" } },
          ],
        },
        scopeSpans: [
          { scope: { name: "langfuse-sdk", version: "3.14.1" }, spans: [] },
        ],
      },
      expected: {
        scopeName: "langfuse-sdk",
        scopeVersion: "3.14.1",
        telemetrySdkLanguage: "python",
      },
      label: "well-formed input",
    },
    {
      input: {},
      expected: {
        scopeName: null,
        scopeVersion: null,
        telemetrySdkLanguage: null,
      },
      label: "empty input",
    },
  ])("$label", ({ input, expected }) => {
    expect(getSdkInfoFromResourceSpans(input)).toEqual(expected);
  });
});
