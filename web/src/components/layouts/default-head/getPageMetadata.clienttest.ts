import { describe, expect, it } from "vitest";
import { getPageMetadata } from "./getPageMetadata";

describe("getPageMetadata", () => {
  it("points every production region at the EU sign-in URL", () => {
    for (const region of ["EU", "US", "JP", "HIPAA"] as const) {
      expect(getPageMetadata("/auth/sign-in", region).canonicalUrl).toBe(
        "https://cloud.langfuse.com/auth/sign-in",
      );
    }
  });

  it("emits no canonical for staging, dev, or self-hosted installs", () => {
    expect(getPageMetadata("/auth/sign-in", "STAGING").canonicalUrl).toBe(
      undefined,
    );
    expect(getPageMetadata("/auth/sign-in", "DEV").canonicalUrl).toBe(
      undefined,
    );
    expect(getPageMetadata("/auth/sign-in", undefined).canonicalUrl).toBe(
      undefined,
    );
  });

  it("does not mention Langfuse Cloud on self-hosted installs", () => {
    const { title, description } = getPageMetadata("/auth/sign-in", undefined);
    expect(title).not.toContain("Cloud");
    expect(description).not.toContain("Cloud");
  });

  it("falls back to the bare product name for unmapped routes", () => {
    expect(getPageMetadata("/project/abc/traces", "EU")).toEqual({
      title: "Langfuse",
    });
    expect(getPageMetadata("/project/abc/traces", undefined)).toEqual({
      title: "Langfuse",
    });
  });
});
