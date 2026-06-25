const mockEnv = vi.hoisted(() => ({
  env: {
    LANGFUSE_USE_AZURE_BLOB: undefined as string | undefined,
  },
}));

vi.mock("@/src/env.mjs", () => mockEnv);

import { afterEach, describe, expect, it, vi } from "vitest";

import { getRequiredUploadHeaders } from "@/src/features/media/server/getRequiredUploadHeaders";

afterEach(() => {
  mockEnv.env.LANGFUSE_USE_AZURE_BLOB = undefined;
});

describe("getRequiredUploadHeaders", () => {
  it("requires x-ms-blob-type when Azure Blob Storage is configured", () => {
    mockEnv.env.LANGFUSE_USE_AZURE_BLOB = "true";
    expect(getRequiredUploadHeaders()).toEqual({
      "x-ms-blob-type": "BlockBlob",
    });
  });

  it("returns no extra headers for S3-compatible storage (flag unset)", () => {
    expect(getRequiredUploadHeaders()).toEqual({});
  });

  it("returns no extra headers when the Azure flag is not exactly 'true'", () => {
    mockEnv.env.LANGFUSE_USE_AZURE_BLOB = "false";
    expect(getRequiredUploadHeaders()).toEqual({});
  });
});
