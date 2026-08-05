import { describe, it, expect } from "vitest";
import {
  checkHeaderBasedDirectWrite,
  checkSdkVersionRequirements,
  getSdkInfoFromResourceSpans,
  isLangfuseSdkTraffic,
  resolveOtelWritePath,
  shouldProcessLegacyOtelMedia,
  type SdkInfo,
} from "../otelIngestionQueue";

describe("isLangfuseSdkTraffic", () => {
  it.each([
    { params: { sdkName: "python" }, expected: true, label: "sdk-name header" },
    {
      params: { sdkName: "javascript" },
      expected: true,
      label: "javascript sdk-name header",
    },
    {
      params: { scopeName: "langfuse-sdk" },
      expected: true,
      label: "langfuse instrumentation scope",
    },
    {
      params: { scopeName: "LangFuse-SDK" },
      expected: true,
      label: "scope match is case-insensitive",
    },
    // The header is normalized to this sentinel when absent, so it must not
    // read as a Langfuse SDK — that would exclude all plain OTel traffic.
    {
      params: { sdkName: "unknown" },
      expected: false,
      label: "unknown sdk-name sentinel",
    },
    {
      params: { sdkName: "unknown", scopeName: "openlit" },
      expected: false,
      label: "third-party scope with no sdk-name",
    },
    { params: {}, expected: false, label: "no signal at all" },
    {
      params: { scopeName: null },
      expected: false,
      label: "null scope name",
    },
  ])("$label → $expected", ({ params, expected }) => {
    expect(isLangfuseSdkTraffic(params)).toBe(expected);
  });
});

describe("resolveOtelWritePath", () => {
  const none = {
    headerBasedDirectWrite: false,
    envForcesDirect: false,
    scopeBasedDirectWrite: false,
    orgCutoffForcesDirect: false,
    langfuseSdkTraffic: false,
  };

  it("falls back to the dual write when no signal qualifies", () => {
    expect(resolveOtelWritePath(none)).toEqual({
      useDirectEventWrite: false,
      writePath: "dual",
    });
  });

  it.each([
    { signal: "headerBasedDirectWrite", writePath: "direct_header" },
    { signal: "envForcesDirect", writePath: "direct_env" },
    { signal: "scopeBasedDirectWrite", writePath: "direct_scope" },
    { signal: "orgCutoffForcesDirect", writePath: "direct_org_cutoff" },
  ] as const)("$signal alone routes to $writePath", ({ signal, writePath }) => {
    expect(resolveOtelWritePath({ ...none, [signal]: true })).toEqual({
      useDirectEventWrite: true,
      writePath,
    });
  });

  // The org cutoff must not absorb batches another signal already routed
  // directly, otherwise the metric overstates what the rollout moved.
  it.each([
    { signal: "headerBasedDirectWrite", writePath: "direct_header" },
    { signal: "envForcesDirect", writePath: "direct_env" },
    { signal: "scopeBasedDirectWrite", writePath: "direct_scope" },
  ] as const)(
    "attributes to $writePath rather than the org cutoff when both apply",
    ({ signal, writePath }) => {
      expect(
        resolveOtelWritePath({
          ...none,
          [signal]: true,
          orgCutoffForcesDirect: true,
        }),
      ).toEqual({ useDirectEventWrite: true, writePath });
    },
  );

  // An older Langfuse SDK keeps the dual write: its trace-level attributes
  // surface on the synthetic root observation that only the dual path
  // materializes, so flipping it would change data those users already read.
  it("leaves Langfuse SDK traffic on the dual write despite the org cutoff", () => {
    expect(
      resolveOtelWritePath({
        ...none,
        orgCutoffForcesDirect: true,
        langfuseSdkTraffic: true,
      }),
    ).toEqual({ useDirectEventWrite: false, writePath: "dual" });
  });

  it("applies the org cutoff to plain OTel traffic", () => {
    expect(
      resolveOtelWritePath({
        ...none,
        orgCutoffForcesDirect: true,
        langfuseSdkTraffic: false,
      }),
    ).toEqual({ useDirectEventWrite: true, writePath: "direct_org_cutoff" });
  });

  // The exclusion is scoped to the cutoff rule — it must not hold back a batch
  // that a header, the env override, or a recognized scope already qualified.
  it.each([
    { signal: "headerBasedDirectWrite", writePath: "direct_header" },
    { signal: "envForcesDirect", writePath: "direct_env" },
    { signal: "scopeBasedDirectWrite", writePath: "direct_scope" },
  ] as const)(
    "still routes $writePath for Langfuse SDK traffic",
    ({ signal, writePath }) => {
      expect(
        resolveOtelWritePath({
          ...none,
          [signal]: true,
          orgCutoffForcesDirect: true,
          langfuseSdkTraffic: true,
        }),
      ).toEqual({ useDirectEventWrite: true, writePath });
    },
  );
});

describe("shouldProcessLegacyOtelMedia", () => {
  it("processes media whenever legacy tables are written", () => {
    expect(
      shouldProcessLegacyOtelMedia({
        mediaUploadEnabled: true,
        writesToLegacyTables: true,
      }),
    ).toBe(true);
  });

  it.each([
    { mediaUploadEnabled: false, writesToLegacyTables: true },
    { mediaUploadEnabled: true, writesToLegacyTables: false },
  ])("skips media when legacy processing is disabled", (params) => {
    expect(shouldProcessLegacyOtelMedia(params)).toBe(false);
  });
});

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
      input: { sdkName: "python", sdkVersion: "4.0.0b1" },
      expected: true,
      label: "python 4.0.0b1 (pep440 beta shorthand at minimum)",
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
