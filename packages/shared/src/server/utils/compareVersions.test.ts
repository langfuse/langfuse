import { describe, expect, it } from "vitest";

import {
  compareParsedVersions,
  compareVersions,
  parseVersionString,
} from "./compareVersions";

describe("parseVersionString", () => {
  it("parses the first three numeric version components", () => {
    expect(parseVersionString("26.5.1.882")).toMatchObject({
      major: 26,
      minor: 5,
      patch: 1,
      tuple: [26, 5, 1],
    });
  });

  it("parses dotted vendor suffixes", () => {
    expect(parseVersionString("21.8.10.1.altinitystable")).toMatchObject({
      major: 21,
      minor: 8,
      patch: 10,
      tuple: [21, 8, 10],
    });
  });
});

describe("compareParsedVersions", () => {
  it("compares parsed versions by major, minor, and patch", () => {
    const older = parseVersionString("25.3.99");
    const newer = parseVersionString("25.4.0");

    if (!older || !newer) {
      throw new Error("Expected versions to parse");
    }

    expect(compareParsedVersions(older, newer)).toBe(-1);
  });
});

describe("compareVersions", () => {
  it("keeps semantic version update classification behavior", () => {
    expect(compareVersions("v1.2.3", "v1.3.0")).toBe("minor");
    expect(compareVersions("v1.2.3-rc.1", "v1.2.3")).toBe("patch");
    expect(compareVersions("v1.2.3", "v1.2.3")).toBeNull();
  });
});
