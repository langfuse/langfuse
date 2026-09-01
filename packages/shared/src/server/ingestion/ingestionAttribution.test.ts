import { describe, expect, it } from "vitest";

import type { AuthHeaderValidVerificationResult } from "../auth/types";
import {
  classifyIngestionSdkAttribution,
  classifyIngestionSdkVersion,
  createIngestionAttribution,
  createUnknownSdkIngestionAttribution,
  extractPublicApiCallerAttribution,
  UNKNOWN_INGESTION_SDK_VALUE,
} from "./ingestionAttribution";

const authCheck = {
  validKey: true,
  scope: {
    projectId: "project-id",
    accessLevel: "project",
    publicKey: "pk-lf-public",
  },
} as AuthHeaderValidVerificationResult;

describe("ingestion attribution", () => {
  it("reuses ingestion SDK normalization for public API caller attribution", () => {
    expect(
      extractPublicApiCallerAttribution({
        x_langfuse_sdk_name: "langfuse-python",
        x_langfuse_sdk_version: "4.8.1rc1",
        "user-agent": "Codex CLI/1.2.3\nignored",
      }),
    ).toEqual({
      sdkName: "python",
      sdkVersion: "4.8.1rc1",
      userAgent: "Codex CLI/1.2.3ignored",
    });
  });

  it("bounds caller-controlled attribution and drops invalid SDK metadata", () => {
    expect(
      extractPublicApiCallerAttribution({
        "x-langfuse-sdk-name": "ruby",
        "x-langfuse-sdk-version": "1.0.0",
        "user-agent": `curl/${"x".repeat(300)}`,
      }),
    ).toEqual({
      userAgent: `curl/${"x".repeat(251)}`,
    });

    expect(
      extractPublicApiCallerAttribution({
        "x-langfuse-sdk-name": "python",
        "x-langfuse-sdk-version": "not-a-version",
      }),
    ).toEqual({ sdkName: "python" });
  });

  it("does not split a Unicode code point at the attribution length bound", () => {
    expect(
      extractPublicApiCallerAttribution({
        "user-agent": `${"x".repeat(255)}😀truncated`,
      }),
    ).toEqual({ userAgent: `${"x".repeat(255)}😀` });
  });

  it("reads SDK attribution from Langfuse request headers", () => {
    expect(
      createIngestionAttribution({
        headers: {
          "x-langfuse-sdk-name": "python",
          "x-langfuse-sdk-version": "3.4.0",
        },
        authCheck,
      }),
    ).toEqual({
      ingestionApiKey: "pk-lf-public",
      ingestionSdkName: "python",
      ingestionSdkVersion: "3.4.0",
    });
  });

  it("matches Langfuse request header names case-insensitively", () => {
    expect(
      createIngestionAttribution({
        headers: {
          "X-Langfuse-Sdk-Name": "python",
          "X-Langfuse-Sdk-Version": "4.8.1",
        },
        authCheck,
      }),
    ).toEqual({
      ingestionApiKey: "pk-lf-public",
      ingestionSdkName: "python",
      ingestionSdkVersion: "4.8.1",
    });
  });

  it("reads SDK attribution from underscore header variants", () => {
    expect(
      createIngestionAttribution({
        headers: {
          x_langfuse_sdk_name: "langfuse-js",
          x_langfuse_sdk_version: "4.2.0",
        },
        authCheck,
      }),
    ).toEqual({
      ingestionApiKey: "pk-lf-public",
      ingestionSdkName: "langfuse-js",
      ingestionSdkVersion: "4.2.0",
    });
  });

  it("uses the unknown SDK marker when requests do not include SDK headers", () => {
    expect(createIngestionAttribution({ headers: {}, authCheck })).toEqual({
      ingestionApiKey: "pk-lf-public",
      ingestionSdkName: UNKNOWN_INGESTION_SDK_VALUE,
      ingestionSdkVersion: UNKNOWN_INGESTION_SDK_VALUE,
    });
  });

  it("creates explicit unknown SDK attribution for non-SDK internal producers", () => {
    expect(createUnknownSdkIngestionAttribution({ authCheck })).toEqual({
      ingestionApiKey: "pk-lf-public",
      ingestionSdkName: UNKNOWN_INGESTION_SDK_VALUE,
      ingestionSdkVersion: UNKNOWN_INGESTION_SDK_VALUE,
    });
  });

  it.each([
    {
      sdkName: "python",
      sdkVersion: "3.9.0",
      expected: {
        canonicalSdkName: "python",
        latestMajor: 4,
        major: 3,
        status: "outdated_major",
      },
    },
    {
      sdkName: "langfuse-python",
      sdkVersion: "4.0.0b1",
      expected: {
        canonicalSdkName: "python",
        latestMajor: 4,
        major: 4,
        status: "current",
      },
    },
    {
      sdkName: "javascript",
      sdkVersion: "4.6.0",
      expected: {
        canonicalSdkName: "javascript",
        latestMajor: 5,
        major: 4,
        status: "outdated_major",
      },
    },
    {
      sdkName: "@langfuse/tracing",
      sdkVersion: "5.1.2-rc.1",
      expected: {
        canonicalSdkName: "javascript",
        latestMajor: 5,
        major: 5,
        status: "current",
      },
    },
    {
      sdkName: "unknown",
      sdkVersion: "unknown",
      expected: {
        canonicalSdkName: null,
        latestMajor: null,
        major: null,
        status: "unknown",
      },
    },
    {
      sdkName: "ruby",
      sdkVersion: "1.0.0",
      expected: {
        canonicalSdkName: null,
        latestMajor: null,
        major: null,
        status: "unsupported_sdk",
      },
    },
    {
      sdkName: "python",
      sdkVersion: "not-a-version",
      expected: {
        canonicalSdkName: "python",
        latestMajor: 4,
        major: null,
        status: "invalid_version",
      },
    },
  ])(
    "classifies $sdkName@$sdkVersion SDK upgrade status",
    ({ sdkName, sdkVersion, expected }) => {
      expect(classifyIngestionSdkVersion({ sdkName, sdkVersion })).toEqual(
        expected,
      );
    },
  );

  it.each([
    ["python", "4.7.0", "attributed"],
    ["unknown", "4.7.0", "missing_name"],
    ["python", "unknown", "missing_version"],
    ["unknown", "unknown", "missing_name_and_version"],
    ["", "", "missing_name_and_version"],
  ] as const)(
    "classifies %s@%s attribution as %s",
    (sdkName, sdkVersion, expected) => {
      expect(classifyIngestionSdkAttribution({ sdkName, sdkVersion })).toBe(
        expected,
      );
    },
  );
});
