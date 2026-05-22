import { getSafeImageUrl, getSafeLinkUrl } from "@/src/components/ui/safe-url";

describe("safe URL helpers", () => {
  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "jav\nascript:alert(1)",
    "vbscript:msgbox(1)",
    "data:text/html,<svg/onload=alert(1)>",
    "ftp://example.com/file.txt",
    "//attacker.example.com/path",
    "relative/path",
  ])("blocks unsafe link URL %s", (url) => {
    expect(getSafeLinkUrl(url)).toBeNull();
  });

  it.each([
    ["https://example.com/path?q=1", "https://example.com/path?q=1"],
    ["http://example.com/image.png", "http://example.com/image.png"],
    ["mailto:security@example.com", "mailto:security@example.com"],
    ["tel:+49123456789", "tel:+49123456789"],
    ["/project/abc/traces/def", "/project/abc/traces/def"],
    ["#section", "#section"],
  ])("allows safe link URL %s", (url, expected) => {
    expect(getSafeLinkUrl(url)).toBe(expected);
  });

  it.each(["mailto:security@example.com", "tel:+49123456789", "#section"])(
    "blocks non-image URL %s for image sources",
    (url) => {
      expect(getSafeImageUrl(url)).toBeNull();
    },
  );

  it.each([
    ["https://example.com/image.png", "https://example.com/image.png"],
    ["http://example.com/image.png", "http://example.com/image.png"],
    ["/api/media/image.png", "/api/media/image.png"],
  ])("allows safe image URL %s", (url, expected) => {
    expect(getSafeImageUrl(url)).toBe(expected);
  });
});
