import { hasGeneratedSchemaMatch } from "@/src/__tests__/vitest-test-db-setup";
import { normalizeTestBaseUrl } from "@/src/__tests__/test-utils";

describe("hasGeneratedSchemaMatch", () => {
  it("returns true when a generated schema matches the current source schema", () => {
    expect(
      hasGeneratedSchemaMatch("model User {}", [
        "model Session {}",
        "model User {}",
      ]),
    ).toBe(true);
  });

  it("returns false when only stale generated schemas are present", () => {
    expect(
      hasGeneratedSchemaMatch("model User { id String }", [
        "model User { id String @id }",
      ]),
    ).toBe(false);
  });
});

describe("normalizeTestBaseUrl", () => {
  it("falls back to localhost when no override is configured", () => {
    expect(normalizeTestBaseUrl()).toBe("http://localhost:3000");
  });

  it("removes trailing slashes from configured base URLs", () => {
    expect(normalizeTestBaseUrl("http://localhost:3010/")).toBe(
      "http://localhost:3010",
    );
  });

  it("drops path suffixes from NEXTAUTH_URL-style values", () => {
    expect(normalizeTestBaseUrl("https://example.com/auth")).toBe(
      "https://example.com",
    );
  });
});
