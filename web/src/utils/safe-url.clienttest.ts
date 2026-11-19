// @vitest-environment node

import { getSafeImageUrl, getSafeLinkUrl } from "@/src/utils/safe-url";

describe("safe URL helpers", () => {
  it.each([
    "data:image/png;base64,iVBORw0KGgo=",
    "blob:https://example.com/123",
    "/icon.svg",
  ])("allows application-owned image source %s", (src) => {
    expect(getSafeImageUrl(src, { allowInlineMedia: true })).toBe(src);
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "//attacker.example/image.png",
    "/\\attacker.example/image.png",
  ])("blocks unsafe application-owned image source %s", (src) => {
    expect(getSafeImageUrl(src, { allowInlineMedia: true })).toBeNull();
  });
  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "jav\nascript:alert(1)",
    "vbscript:msgbox(1)",
    "data:text/html,<svg/onload=alert(1)>",
    "data:image/png;base64,iVBORw0KGgo=",
    "blob:https://example.com/123",
    "ftp://example.com/file.txt",
    "//attacker.example.com/path",
    "/\\attacker.example.com/path",
    "/\\\\attacker.example.com/path",
    "\\attacker.example.com/path",
    "relative\\path",
  ])("blocks unsafe link URL %s", (url) => {
    expect(getSafeLinkUrl(url)).toBeNull();
  });

  it.each([
    ["https://example.com/path?q=1", "https://example.com/path?q=1"],
    ["HTTPS://EXAMPLE.COM/path", "https://example.com/path"],
    ["https://example.com/foo\tbar", "https://example.com/foobar"],
    ["https://example.com/foo bar", "https://example.com/foo%20bar"],
    ["http://example.com/image.png", "http://example.com/image.png"],
    ["irc://irc.example.com/langfuse", "irc://irc.example.com/langfuse"],
    ["ircs://irc.example.com/langfuse", "ircs://irc.example.com/langfuse"],
    ["mailto:security@example.com", "mailto:security@example.com"],
    ["tel:+49123456789", "tel:+49123456789"],
    ["xmpp:security@example.com", "xmpp:security@example.com"],
    ["/project/abc/traces/def", "/project/abc/traces/def"],
    ["relative/path", "relative/path"],
    ["./relative/path", "./relative/path"],
    ["../relative/path", "../relative/path"],
    ["?tab=foo", "?tab=foo"],
    ["#section", "#section"],
  ])("allows safe link URL %s", (url, expected) => {
    expect(getSafeLinkUrl(url)).toBe(expected);
  });

  it.each([
    "mailto:security@example.com",
    "tel:+49123456789",
    "#section",
    "data:image/png;base64,iVBORw0KGgo=",
    "blob:https://example.com/123",
    "//attacker.example.com/path",
    "/\\attacker.example.com/path",
    "/\\\\attacker.example.com/path",
    "\\attacker.example.com/path",
    "relative\\path",
  ])("blocks non-image URL %s for image sources", (url) => {
    expect(getSafeImageUrl(url)).toBeNull();
    expect(getSafeImageUrl(url, { allowInlineMedia: false })).toBeNull();
  });

  it.each([
    ["https://example.com/image.png", "https://example.com/image.png"],
    ["HTTPS://EXAMPLE.COM/image.png", "https://example.com/image.png"],
    ["http://example.com/image.png", "http://example.com/image.png"],
    ["/api/media/image.png", "/api/media/image.png"],
    ["relative/image.png", "relative/image.png"],
    ["./relative/image.png", "./relative/image.png"],
    ["../relative/image.png", "../relative/image.png"],
  ])("allows safe image URL %s", (url, expected) => {
    expect(getSafeImageUrl(url)).toBe(expected);
  });
});
