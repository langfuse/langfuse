import { describe, expect, it } from "vitest";
import { isS3KeyWithinPrefix, parseS3Uri } from "./s3Uri";

describe("parseS3Uri", () => {
  it("parses a canonical bucket and object key", () => {
    expect(parseS3Uri("s3://media-bucket/customer/image.png")).toEqual({
      bucket: "media-bucket",
      key: "customer/image.png",
    });
  });

  it.each([
    "https://media-bucket/customer/image.png",
    "s3://media-bucket",
    "s3:///customer/image.png",
    "s3://media-bucket/",
    "s3://media-bucket//image.png",
    "s3://media-bucket/image.png?versionId=1",
    "s3://media-bucket/image.png#fragment",
  ])("rejects non-canonical URI %s", (value) => {
    expect(parseS3Uri(value)).toBeNull();
  });
});

describe("isS3KeyWithinPrefix", () => {
  it("rejects an empty prefix", () => {
    expect(isS3KeyWithinPrefix("customer/image.png", "")).toBe(false);
  });

  it("accepts keys inside the configured prefix", () => {
    expect(isS3KeyWithinPrefix("customer/image.png", "customer/")).toBe(true);
  });

  it("rejects similarly named sibling prefixes", () => {
    expect(isS3KeyWithinPrefix("customer-other/image.png", "customer/")).toBe(
      false,
    );
    expect(isS3KeyWithinPrefix("customer-other/image.png", "customer")).toBe(
      false,
    );
  });
});
