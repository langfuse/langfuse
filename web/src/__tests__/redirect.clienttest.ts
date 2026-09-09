// @vitest-environment node

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
        expect(getSafeRedirectPath("\\dashboard")).toBe("/");
      });

      it("should handle URL-encoded attack attempts", () => {
        // %2F%2F = //
        expect(getSafeRedirectPath(decodeURIComponent("%2F%2Fevil.com"))).toBe(
          "/",
        );
        // Note: The function receives already-decoded input in real usage
        // since router.query.targetPath is already decoded by Next.js
      });

      it("should block inputs the WHATWG parser would resolve off-origin", () => {
        // `new URL(path, origin)` — the same parse as location.assign.
        expect(getSafeRedirectPath("/\\evil.com")).toBe("/");
        expect(getSafeRedirectPath("/\\evil.com/path")).toBe("/");
        expect(getSafeRedirectPath("/\\\\evil.com")).toBe("/");
        expect(getSafeRedirectPath("\\\\evil.com")).toBe("/");
        expect(getSafeRedirectPath(decodeURIComponent("%2F%5Cevil.com"))).toBe(
          "/",
        );
        // Tab between the slashes is dropped by the URL parser, leaving `//`.
        expect(getSafeRedirectPath("/\t/evil.com")).toBe("/");
        expect(getSafeRedirectPath("/\t\\evil.com")).toBe("/");
      });

      it("should reject absolute URLs that match the dummy parse origin", () => {
        expect(getSafeRedirectPath("https://langfuse.invalid/phishing")).toBe(
          "/",
        );
        expect(getSafeRedirectPath("https:/evil.com")).toBe("/");
      });

      it("should reject paths that normalize to protocol-relative", () => {
        // `/x/..//evil.com` stays on the dummy origin, but pathname is
        // `//evil.com`. Returning that would reopen the redirect.
        expect(getSafeRedirectPath("/x/..//evil.com")).toBe("/");
        expect(getSafeRedirectPath("/..//evil.com")).toBe("/");
        expect(getSafeRedirectPath("/x/..//evil.com/path")).toBe("/");
        expect(getSafeRedirectPath("/x/%2e%2e//evil.com")).toBe("/");
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
      expect(getSafeRedirectPath("/\\evil.com")).toBe("/my-app/");
      expect(getSafeRedirectPath("/x/..//evil.com")).toBe("/my-app/");
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

    it("should only skip prepending when the path is a basePath segment", () => {
      expect(getSafeRedirectPath("/my-application")).toBe(
        "/my-app/my-application",
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
      // The URL serializer percent-encodes spaces in the pathname.
      expect(getSafeRedirectPath("/path/with spaces")).toBe(
        "/path/with%20spaces",
      );
      expect(getSafeRedirectPath("/path/with-dashes")).toBe(
        "/path/with-dashes",
      );
      expect(getSafeRedirectPath("/path/with_underscores")).toBe(
        "/path/with_underscores",
      );
    });

    it("should return the WHATWG-resolved path for otherwise-safe inputs", () => {
      expect(getSafeRedirectPath("/project\\123")).toBe("/project/123");
      expect(getSafeRedirectPath("/dashboard\\tab?view=traces")).toBe(
        "/dashboard/tab?view=traces",
      );
      expect(getSafeRedirectPath("/foo/../bar")).toBe("/bar");
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

  describe("control character injection", () => {
    beforeEach(() => {
      (env as any).NEXT_PUBLIC_BASE_PATH = undefined;
    });

    it("should strip newlines from paths", () => {
      // Newline injection (HTTP header / log forging) is sanitized
      expect(getSafeRedirectPath("/abc\nevil.com")).toBe("/abcevil.com");
      // CRLF is also stripped
      expect(getSafeRedirectPath("/abc\r\ndef")).toBe("/abcdef");
      // Multiple newlines collapse safely
      expect(getSafeRedirectPath("/a\n\n\nb")).toBe("/ab");
    });

    it("should percent-encode null bytes and DEL in paths", () => {
      expect(getSafeRedirectPath("/dashboard\u0000.png")).toBe(
        "/dashboard%00.png",
      );
      expect(getSafeRedirectPath("/abc\u0000evil")).toBe("/abc%00evil");
      expect(getSafeRedirectPath("/abc\u007Fdef")).toBe("/abc%7Fdef");
      expect(getSafeRedirectPath("/abc\u001Fdef")).toBe("/abc%1Fdef");
    });

    it("should strip tabs that the URL parser treats as ignorable", () => {
      expect(getSafeRedirectPath("/abc\tdef")).toBe("/abcdef");
    });

    it("should percent-encode Unicode bidi-formatting characters", () => {
      expect(getSafeRedirectPath("/abc\u202eevil")).toBe("/abc%E2%80%AEevil");
    });

    it("should fall back to safe default when path is only control characters", () => {
      expect(getSafeRedirectPath("\n")).toBe("/");
      expect(getSafeRedirectPath("\u0000\u0000")).toBe("/");
    });

    it("should fall back to safe default for path with no leading slash", () => {
      // U+202E is not path-absolute, so it is rejected even though
      // the URL parser would resolve it same-origin as /%E2%80%AE.
      expect(getSafeRedirectPath("\u202e")).toBe("/");
    });

    it("should percent-encode internal spaces", () => {
      expect(getSafeRedirectPath("/abc def")).toBe("/abc%20def");
      expect(getSafeRedirectPath("/a b c")).toBe("/a%20b%20c");
    });

    it("should keep protocol-relative and absolute-URL guards working with control characters", () => {
      expect(getSafeRedirectPath("//\nevil.com")).toBe("/");
      expect(getSafeRedirectPath("http:\n//evil.com")).toBe("/");
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

    it("strips ASCII control characters from the path", () => {
      // Newline (header-injection vector)
      expect(stripBasePath("/apps\n/dashboard")).toBe("/dashboard");
      // CRLF
      expect(stripBasePath("/apps\r\n/dashboard")).toBe("/dashboard");
      // Null byte (path-extension confusion)
      expect(stripBasePath("/apps\u0000/dashboard")).toBe("/dashboard");
      // DEL (0x7F)
      expect(stripBasePath("/apps\u007F/dashboard")).toBe("/dashboard");
      // Multiple control chars in one path
      expect(stripBasePath("/apps\n\r\u0000/dashboard")).toBe("/dashboard");
    });

    it("does NOT strip Unicode bidi-formatting characters outside the C0 range", () => {
      // U+202E (RTL-override) is intentionally out of scope for this fix;
      // it lives at 0x202E, beyond the 0x00-0x1F / 0x7F regex scope. The
      // result still has a leading "/" so it survives the path-vs-leading-
      // slash guard; downstream code decides whether to display it.
      expect(stripBasePath("/apps\u202E/dashboard")).toBe("/\u202E/dashboard");
    });

    it("leaves paths without basePath untouched", () => {
      expect(stripBasePath("/no-base")).toBe("/no-base");
    });
  });
});
