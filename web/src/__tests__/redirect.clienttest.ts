import { getSafeRedirectPath, stripBasePath } from "@/src/utils/redirect";
import { env } from "@/src/env.mjs";

describe("getSafeRedirectPath", () => {
  const originalBasePath = env.NEXT_PUBLIC_BASE_PATH;

  afterAll(() => {
    // Restore original value after all tests
    (env as any).NEXT_PUBLIC_BASE_PATH = originalBasePath;
  });

  describe("without basePath configured", () => {
    beforeEach(() => {
      // Ensure basePath is undefined for these tests
      (env as any).NEXT_PUBLIC_BASE_PATH = undefined;
    });

    it("should return '/' for null input", () => {
      expect(getSafeRedirectPath(null)).toBe("/");
    });

    it("should return '/' for undefined input", () => {
      expect(getSafeRedirectPath(undefined)).toBe("/");
    });

    it("should return '/' for empty string", () => {
      expect(getSafeRedirectPath("")).toBe("/");
    });

    it("should return '/' for whitespace-only string", () => {
      expect(getSafeRedirectPath("   ")).toBe("/");
    });

    it("should allow valid relative paths", () => {
      expect(getSafeRedirectPath("/dashboard")).toBe("/dashboard");
      expect(getSafeRedirectPath("/project/123")).toBe("/project/123");
      expect(getSafeRedirectPath("/settings")).toBe("/settings");
      expect(getSafeRedirectPath("/")).toBe("/");
    });

    it("should allow paths with query parameters", () => {
      expect(getSafeRedirectPath("/dashboard?tab=overview")).toBe(
        "/dashboard?tab=overview",
      );
      expect(getSafeRedirectPath("/project/123?view=traces")).toBe(
        "/project/123?view=traces",
      );
    });

    it("should allow paths with hash fragments", () => {
      expect(getSafeRedirectPath("/dashboard#section")).toBe(
        "/dashboard#section",
      );
      expect(getSafeRedirectPath("/settings#profile")).toBe(
        "/settings#profile",
      );
    });

    it("should trim whitespace from paths", () => {
      expect(getSafeRedirectPath("  /dashboard  ")).toBe("/dashboard");
      expect(getSafeRedirectPath("\t/project/123\n")).toBe("/project/123");
    });

    describe("open redirect attack prevention", () => {
      it("should block protocol-relative URLs", () => {
        expect(getSafeRedirectPath("//evil.com")).toBe("/");
        expect(getSafeRedirectPath("//evil.com/path")).toBe("/");
        expect(getSafeRedirectPath("///evil.com")).toBe("/");
      });

      it("should block absolute HTTP URLs", () => {
        expect(getSafeRedirectPath("http://evil.com")).toBe("/");
        expect(getSafeRedirectPath("http://evil.com/path")).toBe("/");
      });

      it("should block absolute HTTPS URLs", () => {
        expect(getSafeRedirectPath("https://evil.com")).toBe("/");
        expect(getSafeRedirectPath("https://evil.com/path")).toBe("/");
      });

      it("should block javascript: URIs", () => {
        expect(getSafeRedirectPath("javascript:alert(1)")).toBe("/");
        expect(getSafeRedirectPath("javascript:void(0)")).toBe("/");
      });

      it("should block data: URIs", () => {
        expect(
          getSafeRedirectPath("data:text/html,<script>alert(1)</script>"),
        ).toBe("/");
        expect(getSafeRedirectPath("data:text/plain,test")).toBe("/");
      });

      it("should block file: URIs", () => {
        expect(getSafeRedirectPath("file:///etc/passwd")).toBe("/");
        expect(getSafeRedirectPath("file://server/share")).toBe("/");
      });

      it("should block ftp: URIs", () => {
        expect(getSafeRedirectPath("ftp://evil.com")).toBe("/");
      });

      it("should block other protocol schemes", () => {
        expect(getSafeRedirectPath("mailto:test@example.com")).toBe("/");
        expect(getSafeRedirectPath("tel:+1234567890")).toBe("/");
        expect(getSafeRedirectPath("vbscript:alert(1)")).toBe("/");
      });

      it("should block paths that don't start with /", () => {
        expect(getSafeRedirectPath("dashboard")).toBe("/");
        expect(getSafeRedirectPath("./dashboard")).toBe("/");
        expect(getSafeRedirectPath("../dashboard")).toBe("/");
        expect(getSafeRedirectPath("evil.com")).toBe("/");
      });

      it("should handle URL-encoded attack attempts", () => {
        // %2F%2F = //
        expect(getSafeRedirectPath(decodeURIComponent("%2F%2Fevil.com"))).toBe(
          "/",
        );
        // Note: The function receives already-decoded input in real usage
        // since router.query.targetPath is already decoded by Next.js
      });
    });
  });

  describe("with basePath configured", () => {
    beforeEach(() => {
      // Set basePath for these tests
      (env as any).NEXT_PUBLIC_BASE_PATH = "/my-app";
    });

    afterEach(() => {
      // Reset basePath after tests
      (env as any).NEXT_PUBLIC_BASE_PATH = undefined;
    });

    it("should return basePath for null input", () => {
      expect(getSafeRedirectPath(null)).toBe("/my-app/");
    });

    it("should return basePath for undefined input", () => {
      expect(getSafeRedirectPath(undefined)).toBe("/my-app/");
    });

    it("should return basePath for empty string", () => {
      expect(getSafeRedirectPath("")).toBe("/my-app/");
    });

    it("should prepend basePath to valid relative paths", () => {
      expect(getSafeRedirectPath("/dashboard")).toBe("/my-app/dashboard");
      expect(getSafeRedirectPath("/project/123")).toBe("/my-app/project/123");
      expect(getSafeRedirectPath("/")).toBe("/my-app/");
    });

    it("should prepend basePath to paths with query parameters", () => {
      expect(getSafeRedirectPath("/dashboard?tab=overview")).toBe(
        "/my-app/dashboard?tab=overview",
      );
    });

    it("should prepend basePath to paths with hash fragments", () => {
      expect(getSafeRedirectPath("/dashboard#section")).toBe(
        "/my-app/dashboard#section",
      );
    });

    it("should return basePath for blocked URLs", () => {
      expect(getSafeRedirectPath("//evil.com")).toBe("/my-app/");
      expect(getSafeRedirectPath("http://evil.com")).toBe("/my-app/");
      expect(getSafeRedirectPath("javascript:alert(1)")).toBe("/my-app/");
    });

    it("should not double-prepend basePath when path already includes it", () => {
      // This prevents the bug where basePath gets added multiple times
      // Scenario: path already includes basePath (e.g., from asPath in Next.js router)
      expect(getSafeRedirectPath("/my-app")).toBe("/my-app");
      expect(getSafeRedirectPath("/my-app/")).toBe("/my-app/");
      expect(getSafeRedirectPath("/my-app/dashboard")).toBe(
        "/my-app/dashboard",
      );
      expect(getSafeRedirectPath("/my-app/project/123")).toBe(
        "/my-app/project/123",
      );
      expect(getSafeRedirectPath("/my-app/dashboard?tab=overview")).toBe(
        "/my-app/dashboard?tab=overview",
      );
      expect(getSafeRedirectPath("/my-app/dashboard#section")).toBe(
        "/my-app/dashboard#section",
      );
    });

    it("should handle edge case where basePath appears in path but not at start", () => {
      // Path contains basePath but doesn't start with it - should still prepend
      expect(getSafeRedirectPath("/some/my-app/path")).toBe(
        "/my-app/some/my-app/path",
      );
    });
  });

  describe("edge cases", () => {
    beforeEach(() => {
      (env as any).NEXT_PUBLIC_BASE_PATH = undefined;
    });

    it("should handle very long paths", () => {
      const longPath = "/project/" + "a".repeat(1000);
      expect(getSafeRedirectPath(longPath)).toBe(longPath);
    });

    it("should handle paths with special characters", () => {
      expect(getSafeRedirectPath("/path/with spaces")).toBe(
        "/path/with spaces",
      );
      expect(getSafeRedirectPath("/path/with-dashes")).toBe(
        "/path/with-dashes",
      );
      expect(getSafeRedirectPath("/path/with_underscores")).toBe(
        "/path/with_underscores",
      );
    });

    it("should handle paths with encoded characters", () => {
      expect(getSafeRedirectPath("/path%20with%20spaces")).toBe(
        "/path%20with%20spaces",
      );
      expect(getSafeRedirectPath("/path%2Fwith%2Fencoded")).toBe(
        "/path%2Fwith%2Fencoded",
      );
    });

    it("should handle non-string input gracefully", () => {
      // @ts-expect-error Testing runtime behavior with invalid input
      expect(getSafeRedirectPath(123)).toBe("/");
      // @ts-expect-error Testing runtime behavior with invalid input
      expect(getSafeRedirectPath({})).toBe("/");
      // @ts-expect-error Testing runtime behavior with invalid input
      expect(getSafeRedirectPath([])).toBe("/");
    });
  });
});

describe("stripBasePath", () => {
  const originalBasePath = env.NEXT_PUBLIC_BASE_PATH;

  afterAll(() => {
    (env as any).NEXT_PUBLIC_BASE_PATH = originalBasePath;
  });

  describe("without basePath configured", () => {
    beforeEach(() => {
      (env as any).NEXT_PUBLIC_BASE_PATH = undefined;
    });

    it("returns path unchanged", () => {
      expect(stripBasePath("/dashboard")).toBe("/dashboard");
    });

    it("normalizes empty values to '/'", () => {
      expect(stripBasePath("")).toBe("/");
      expect(stripBasePath(undefined as unknown as string)).toBe("/");
    });
  });

  describe("with basePath configured", () => {
    beforeEach(() => {
      (env as any).NEXT_PUBLIC_BASE_PATH = "/apps";
    });

    afterEach(() => {
      (env as any).NEXT_PUBLIC_BASE_PATH = undefined;
    });

    it("strips the basePath prefix", () => {
      expect(stripBasePath("/apps")).toBe("/");
      expect(stripBasePath("/apps/")).toBe("/");
      expect(stripBasePath("/apps/project/123")).toBe("/project/123");
    });

    it("handles query strings and hashes", () => {
      expect(stripBasePath("/apps/project/123?foo=bar")).toBe(
        "/project/123?foo=bar",
      );
      expect(stripBasePath("/apps/dashboard#section")).toBe(
        "/dashboard#section",
      );
      expect(stripBasePath("/apps/?foo=bar#top")).toBe("/?foo=bar#top");
    });

    it("only strips the first occurrence", () => {
      expect(stripBasePath("/apps/apps/dashboard")).toBe("/apps/dashboard");
    });

    it("leaves paths without basePath untouched", () => {
      expect(stripBasePath("/no-base")).toBe("/no-base");
    });
  });
});
