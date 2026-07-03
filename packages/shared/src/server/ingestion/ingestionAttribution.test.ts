import { describe, expect, it } from "vitest";

import type { AuthHeaderValidVerificationResult } from "../auth/types";
import {
  createIngestionAttribution,
  createUnknownSdkIngestionAttribution,
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
});
