import { describe, expect, it } from "vitest";
import { isMultipartPartLimitError } from "../features/blobstorage/partLimitError";

// Mirrors handleStorageError's wrapping of the underlying SDK cause.
function uploadWrapped(cause: unknown): Error {
  return new Error("Failed to upload file to S3", { cause });
}

// The exact @aws-sdk/lib-storage message.
const AWS_PART_LIMIT_MESSAGE =
  "Exceeded 10000 parts in multipart upload to Bucket: my-bucket Key: p/traces/2026-01-01.json.";

describe("isMultipartPartLimitError", () => {
  it("matches the raw AWS SDK part-limit message", () => {
    expect(isMultipartPartLimitError(new Error(AWS_PART_LIMIT_MESSAGE))).toBe(
      true,
    );
  });

  it("matches the message through StorageService's cause wrapping", () => {
    expect(
      isMultipartPartLimitError(
        uploadWrapped(new Error(AWS_PART_LIMIT_MESSAGE)),
      ),
    ).toBe(true);
  });

  it("tolerates wording drift (case, no multipart-upload tail)", () => {
    expect(isMultipartPartLimitError(new Error("EXCEEDED 10000 PARTS"))).toBe(
      true,
    );
    expect(isMultipartPartLimitError(new Error("Exceeded 10,000 parts"))).toBe(
      true,
    );
  });

  it("does not match unrelated upload errors", () => {
    expect(isMultipartPartLimitError(new Error("Access Denied"))).toBe(false);
    expect(
      isMultipartPartLimitError(uploadWrapped(new Error("connection reset"))),
    ).toBe(false);
    expect(isMultipartPartLimitError(undefined)).toBe(false);
    expect(isMultipartPartLimitError("some string")).toBe(false);
  });
});
