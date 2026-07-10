import { describe, expect, it } from "vitest";

import type { AuthHeaderValidVerificationResult } from "../auth/types";
import {
  classifyIngestionSdkVersion,
  createIngestionAttribution,
  createUnknownSdkIngestionAttribution,
  summarizeIngestionSdkUsage,
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
});

describe("summarizeIngestionSdkUsage", () => {
  it("aggregates per canonical SDK and picks the predominant version", () => {
    expect(
      summarizeIngestionSdkUsage([
        { sdkName: "python", sdkVersion: "3.4.0", count: 10 },
        { sdkName: "langfuse-python", sdkVersion: "3.4.0", count: 5 },
        { sdkName: "python", sdkVersion: "2.60.0", count: 8 },
        { sdkName: "@langfuse/tracing", sdkVersion: "5.1.2", count: 3 },
        { sdkName: "langfuse-js", sdkVersion: "5.1.2", count: 2 },
        { sdkName: "@langfuse/openai", sdkVersion: "4.0.0", count: 4 },
      ]),
    ).toEqual({
      python: { predominantVersion: "3.4.0", eventCount: 23 },
      javascript: { predominantVersion: "5.1.2", eventCount: 9 },
    });
  });

  it("folds pre-release suffixes into their base version", () => {
    expect(
      summarizeIngestionSdkUsage([
        { sdkName: "python", sdkVersion: "3.4.0-rc.1", count: 3 },
        { sdkName: "python", sdkVersion: "3.4.0", count: 3 },
        { sdkName: "python", sdkVersion: "3.3.0", count: 5 },
      ]),
    ).toEqual({
      python: { predominantVersion: "3.4.0", eventCount: 11 },
    });
  });

  it("drops unknown and unsupported SDK rows", () => {
    expect(
      summarizeIngestionSdkUsage([
        {
          sdkName: UNKNOWN_INGESTION_SDK_VALUE,
          sdkVersion: "1.0.0",
          count: 100,
        },
        {
          sdkName: "python",
          sdkVersion: UNKNOWN_INGESTION_SDK_VALUE,
          count: 100,
        },
        { sdkName: "ruby", sdkVersion: "1.0.0", count: 100 },
        { sdkName: "python", sdkVersion: "3.4.0", count: 1 },
      ]),
    ).toEqual({
      python: { predominantVersion: "3.4.0", eventCount: 1 },
    });
  });

  it("returns an empty summary for no rows", () => {
    expect(summarizeIngestionSdkUsage([])).toEqual({});
  });
});
