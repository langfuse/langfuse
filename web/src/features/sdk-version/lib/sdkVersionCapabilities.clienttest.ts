import { describe, expect, it } from "vitest";

import { getSdkVersionCapabilityStatus } from "./sdkVersionCapabilities";

describe("experiment instrumentation SDK capability", () => {
  it.each([
    ["python", "3.3.5", "unsupported"],
    ["python", "3.4.0", "supported"],
    ["javascript", "4.0.1", "unsupported"],
    ["javascript", "4.1.0", "supported"],
  ] as const)(
    "classifies experiment runner support for %s %s as %s",
    (language, version, expected) => {
      expect(
        getSdkVersionCapabilityStatus(
          { language, version },
          "experimentRunner",
        ),
      ).toBe(expected);
    },
  );

  it.each([
    ["python", "3.99.0", "unsupported"],
    ["python", "4.0.0", "supported"],
    ["javascript", "5.9.9", "unsupported"],
    ["javascript", "5.10.0", "supported"],
  ] as const)("classifies %s %s as %s", (language, version, expected) => {
    expect(
      getSdkVersionCapabilityStatus(
        { language, version },
        "experimentLinkDeprecation",
      ),
    ).toBe(expected);
  });
});
