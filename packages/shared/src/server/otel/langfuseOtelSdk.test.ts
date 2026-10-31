import { describe, expect, it } from "vitest";

import {
  batchContainsLangfuseScope,
  checkHeaderBasedDirectWrite,
  classifyLangfuseOtelSdkFromHeaders,
  legacyLangfuseSdkScopeRejection,
} from "./langfuseOtelSdk";

describe("classifyLangfuseOtelSdkFromHeaders", () => {
  it.each([
    { sdkName: "python", sdkVersion: "4.0.0" },
    { sdkName: "python", sdkVersion: "4.2.1" },
    { sdkName: "python", sdkVersion: "4.0.0-rc.1" },
    { sdkName: "python", sdkVersion: "4.0.0b1" },
    { sdkName: "langfuse-python", sdkVersion: "4.1.0" },
    { sdkName: "javascript", sdkVersion: "5.0.0" },
    { sdkName: "javascript", sdkVersion: "5.1.3" },
    { sdkName: "@langfuse/tracing", sdkVersion: "5.0.0" },
    { sdkName: "langfuse-js", sdkVersion: "5.2.0" },
  ])("allows a current Langfuse SDK ($sdkName $sdkVersion)", (headers) => {
    expect(classifyLangfuseOtelSdkFromHeaders(headers)).toEqual({
      action: "allow",
    });
  });

  it.each([
    {
      headers: { sdkName: "python", sdkVersion: "3.9.0" },
      sdk: "python",
      versionBucket: "3",
    },
    {
      headers: { sdkName: "langfuse-python", sdkVersion: "3.9.0-rc.1" },
      sdk: "python",
      versionBucket: "3",
    },
    {
      headers: { sdkName: "javascript", sdkVersion: "4.6.0" },
      sdk: "javascript",
      versionBucket: "4",
    },
    {
      headers: { sdkName: "@langfuse/otel", sdkVersion: "4.4.0" },
      sdk: "javascript",
      versionBucket: "4",
    },
    {
      headers: { sdkName: "python" },
      sdk: "python",
      versionBucket: "missing",
    },
    {
      headers: { sdkName: "python", sdkVersion: "unknown" },
      sdk: "python",
      versionBucket: "missing",
    },
    {
      headers: { sdkName: "python", sdkVersion: "not-a-version" },
      sdk: "python",
      versionBucket: "invalid",
    },
    {
      headers: {
        sdkName: "langfuse-internal-otel-writer",
        sdkVersion: "1.0.0",
      },
      sdk: "langfuse",
      versionBucket: "1",
    },
  ])(
    "rejects an old or unversioned Langfuse SDK",
    ({ headers, sdk, versionBucket }) => {
      expect(classifyLangfuseOtelSdkFromHeaders(headers)).toEqual({
        action: "reject",
        sdk,
        versionBucket,
      });
    },
  );

  it.each([
    {},
    { sdkName: "unknown", sdkVersion: "1.0.0" },
    { sdkName: "ruby", sdkVersion: "1.0.0" },
    { sdkName: "openllmetry", sdkVersion: "0.1.0" },
    { sdkVersion: "4.0.0" },
  ])("does not treat non-Langfuse headers as an old SDK", (headers) => {
    expect(classifyLangfuseOtelSdkFromHeaders(headers)).toEqual({
      action: "check_scope",
    });
  });

  it("keeps the direct-write threshold helper's ingestion-version opt-in", () => {
    expect(
      checkHeaderBasedDirectWrite({
        sdkName: "python",
        sdkVersion: "3.0.0",
        ingestionVersion: "4",
      }),
    ).toBe(true);
    expect(
      classifyLangfuseOtelSdkFromHeaders({
        sdkName: "python",
        sdkVersion: "3.0.0",
      }),
    ).toEqual({
      action: "reject",
      sdk: "python",
      versionBucket: "3",
    });
  });
});

describe("legacyLangfuseSdkScopeRejection", () => {
  const batch = (...scopeNames: string[]) => [
    {
      scopeSpans: scopeNames.map((name) => ({ scope: { name }, spans: [] })),
    },
  ];

  it("rejects a Langfuse instrumentation scope", () => {
    expect(legacyLangfuseSdkScopeRejection(batch("langfuse-sdk"))).toEqual({
      sdk: "scope",
      versionBucket: "scope_only",
    });
  });

  it("rejects a Langfuse scope mixed into a third-party batch", () => {
    expect(
      legacyLangfuseSdkScopeRejection(batch("opentelemetry", "LangFuse-SDK")),
    ).toEqual({
      sdk: "scope",
      versionBucket: "scope_only",
    });
  });

  it.each([
    {
      spans: batch("opentelemetry.instrumentation.requests"),
      label: "plain OTel",
    },
    { spans: batch("openlit", "openinference"), label: "third-party scopes" },
    { spans: [], label: "an empty batch" },
  ])("allows $label", ({ spans }) => {
    expect(legacyLangfuseSdkScopeRejection(spans)).toBeNull();
    expect(batchContainsLangfuseScope(spans)).toBe(false);
  });
});
