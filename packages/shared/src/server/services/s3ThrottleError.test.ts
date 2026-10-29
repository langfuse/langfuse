import { describe, expect, it } from "vitest";

import { isS3SlowDownError } from "./s3ThrottleError";

describe("isS3SlowDownError", () => {
  it("matches the SDK error name, code, and message", () => {
    expect(isS3SlowDownError({ name: "SlowDown" })).toBe(true);
    expect(isS3SlowDownError({ Code: "SlowDown" })).toBe(true);
    expect(isS3SlowDownError({ code: "SlowDown" })).toBe(true);
    expect(
      isS3SlowDownError(new Error("Please reduce your request rate.")),
    ).toBe(true);
  });

  it("matches a SlowDown wrapped as the cause of a storage error", () => {
    const cause = Object.assign(new Error("Please reduce your request rate."), {
      name: "SlowDown",
      Code: "SlowDown",
    });
    const wrapped = new Error("Failed to download file from S3", { cause });

    expect(isS3SlowDownError(wrapped)).toBe(true);
  });

  it("does not match an unrelated storage failure", () => {
    const wrapped = new Error("Failed to download file from S3", {
      cause: Object.assign(new Error("The specified key does not exist."), {
        name: "NoSuchKey",
      }),
    });

    expect(isS3SlowDownError(wrapped)).toBe(false);
    expect(isS3SlowDownError(null)).toBe(false);
    expect(isS3SlowDownError("SlowDown")).toBe(false);
  });
});
