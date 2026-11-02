import { describe, expect, it } from "vitest";

import {
  BLOB_STORAGE_REGION_INVALID_MESSAGE,
  normalizeBlobStorageRegion,
  truncate,
} from "./stringChecks";

function hasLoneSurrogate(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = s.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      i++;
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      return true;
    }
  }
  return false;
}

describe("normalizeBlobStorageRegion", () => {
  it.each([
    ["us-west-2", "AWS"],
    ["europe-west1", "GCP"],
    ["us-central1", "GCP"],
    ["US", "GCS multi-region"],
    ["eastus", "Azure"],
    ["westeurope", "Azure"],
    ["germanywestcentral", "Azure"],
    ["auto", "GCS/R2 signing region"],
    ["wnam", "Cloudflare R2"],
    ["us-ashburn-1", "OCI"],
    ["us-west-004", "Backblaze"],
  ])("accepts %s (%s)", (region) => {
    expect(normalizeBlobStorageRegion(` ${region} `)).toBe(region);
  });

  it.each([
    "us west-2",
    "East US",
    "US-CENTRAL1+US-EAST1",
    "us_west_2",
    "-us-west-2",
    "us-west-2-",
    "a".repeat(64),
  ])("rejects %s", (region) => {
    expect(() => normalizeBlobStorageRegion(region)).toThrow(
      BLOB_STORAGE_REGION_INVALID_MESSAGE,
    );
  });
});

describe("truncate", () => {
  it("returns the string unchanged when at or under the limit", () => {
    expect(truncate("hello", 16)).toBe("hello");
    expect(truncate("exactly-sixteen!", 16)).toBe("exactly-sixteen!");
  });

  it("appends an ellipsis when over the limit", () => {
    expect(truncate("this is definitely longer than sixteen", 16)).toBe(
      "this is definite...",
    );
  });

  it("counts code points, not UTF-16 code units, for the limit", () => {
    expect(truncate("🎉".repeat(9), 16)).toBe("🎉".repeat(9));
  });

  it("does not split surrogate pairs when the cut lands mid-pair", () => {
    const input = "a" + "🎉".repeat(20);
    const out = truncate(input, 16);
    expect(hasLoneSurrogate(out)).toBe(false);
    expect(out).toBe("a" + "🎉".repeat(15) + "...");
  });

  it("keeps astral characters intact for realistic model names", () => {
    const input = "gpt-4o-" + "🚀".repeat(30) + "-preview";
    const out = truncate(input, 30);
    expect(hasLoneSurrogate(out)).toBe(false);
    expect(out.endsWith("...")).toBe(true);
  });

  it("handles mathematical alphanumeric (astral) code points", () => {
    const input = "𝟙𝟚𝟛𝟜𝟝𝟞𝟟𝟠𝟡";
    const out = truncate(input, 5);
    expect(hasLoneSurrogate(out)).toBe(false);
    expect(out).toBe("𝟙𝟚𝟛𝟜𝟝...");
  });

  it("leaves BMP (non-astral) strings such as CJK unaffected", () => {
    expect(truncate("你好世界你好世界", 5)).toBe("你好世界你...");
  });
});
