import { describe, expect, it } from "vitest";
import {
  classifyMediaValue,
  splitStringByMediaReferences,
} from "@/src/components/ui/media/mediaUtils";

describe("classifyMediaValue", () => {
  const ref =
    "@@@langfuseMedia:type=image/png|id=cc48838a-3da8-4ca4-a007-2cf8df930e69|source=bytes@@@";

  it("parses a Langfuse media reference", () => {
    expect(classifyMediaValue(ref)).toEqual({
      kind: "langfuseRef",
      contentType: "image/png",
      mediaId: "cc48838a-3da8-4ca4-a007-2cf8df930e69",
      referenceString: ref,
    });
  });

  it("parses a data URI by its MIME head, not the whole payload", () => {
    const src = "data:image/jpeg;base64," + "A".repeat(5000);
    expect(classifyMediaValue(src)).toEqual({
      kind: "dataUri",
      contentType: "image/jpeg",
      src,
    });
  });

  it("classifies a multi-megabyte base64 data URI (the huge-IO case)", () => {
    // One unbroken 8 MB base64 token — the payload shape from LFE-10152 seeding.
    const src = "data:image/png;base64," + "A".repeat(8 * 1024 * 1024);
    const descriptor = classifyMediaValue(src);
    expect(descriptor).toMatchObject({
      kind: "dataUri",
      contentType: "image/png",
    });
    // Whole payload is preserved as the src; only the head is scanned.
    expect(descriptor?.kind === "dataUri" && descriptor.src).toBe(src);
  });

  it("classifies genuine data URIs with header variants", () => {
    // Percent-encoded (non-base64) SVG image.
    expect(
      classifyMediaValue("data:image/svg+xml,%3Csvg%3E%3C/svg%3E")?.contentType,
    ).toBe("image/svg+xml");
    // A parameter (charset) before the mandatory comma.
    expect(
      classifyMediaValue("data:image/svg+xml;charset=utf-8,<svg></svg>")
        ?.contentType,
    ).toBe("image/svg+xml");
    // Audio + video top-level types are previewable too.
    expect(classifyMediaValue("data:audio/mpeg;base64,AAAA")?.contentType).toBe(
      "audio/mpeg",
    );
    expect(classifyMediaValue("data:video/mp4;base64,AAAA")?.contentType).toBe(
      "video/mp4",
    );
    // Empty payload is still a well-formed (comma-terminated) data URI.
    expect(classifyMediaValue("data:image/png;base64,")?.contentType).toBe(
      "image/png",
    );
  });

  it("accepts the base64 token case-insensitively (WHATWG data-URL spec)", () => {
    // Browsers accept `;BASE64,` / `;Base64,`; the regex's `i` flag matches
    // them. The lowercase mediatype still gates previewability.
    expect(classifyMediaValue("data:image/png;BASE64,AAAA")?.contentType).toBe(
      "image/png",
    );
    expect(classifyMediaValue("data:audio/mpeg;Base64,AAAA")?.contentType).toBe(
      "audio/mpeg",
    );
  });

  it("does not classify a data URI whose header exceeds the scan window", () => {
    // Documents the intentional bound: only the first 256 chars of the head are
    // scanned, so a (valid but) pathologically long header pushes its mandatory
    // comma out of range and the value falls through to plain-string handling.
    // Real image/audio/video headers are well under 40 chars, so this never
    // affects genuine media.
    const longHeader = "data:image/png;charset=" + "a".repeat(300) + ",AAAA";
    expect(classifyMediaValue(longHeader)).toBeNull();
    // Same header, comfortably within the window, is classified normally.
    const shortHeader = "data:image/png;charset=" + "a".repeat(10) + ",AAAA";
    expect(classifyMediaValue(shortHeader)?.contentType).toBe("image/png");
  });

  it("ignores non-previewable data URIs", () => {
    expect(classifyMediaValue("data:text/plain,hello")).toBeNull();
    expect(classifyMediaValue("data:application/json,{}")).toBeNull();
  });

  it("does not mistake prose or malformed 'data:' strings for media", () => {
    // No comma at all -> not a data URI, just a string that starts like one.
    expect(classifyMediaValue("data:image/png")).toBeNull();
    // Prose after the MIME head: the header is not comma-terminated.
    expect(
      classifyMediaValue("data:image/png is the best format for screenshots"),
    ).toBeNull();
    // A comma appears, but only later inside prose — the header itself is not
    // well-formed up to a comma.
    expect(
      classifyMediaValue("data:audio/mpeg not supported, sadly"),
    ).toBeNull();
    // "base64" without the terminating comma is still malformed.
    expect(classifyMediaValue("data:image/png;base64")).toBeNull();
    // A huge non-data-URI string that merely starts with the prefix must fall
    // through (so the caller truncates it) instead of being handed off whole.
    expect(
      classifyMediaValue("data:image/png " + "x".repeat(5_000_000)),
    ).toBeNull();
  });

  it("does not treat a bare base64-ish token or embedded substring as media", () => {
    // Short base64-looking tokens are not data URIs.
    expect(classifyMediaValue("aGVsbG8gd29ybGQ=")).toBeNull();
    expect(classifyMediaValue("iVBORw0KGgoAAAANSUhEUgAA")).toBeNull();
    // A JSON string that merely contains a "data:" substring, not at the start.
    expect(
      classifyMediaValue('{"note":"see data:image/png;base64,AAAA"}'),
    ).toBeNull();
  });

  it("classifies image/audio/video URLs by extension", () => {
    expect(classifyMediaValue("https://x.com/a/b.png")?.contentType).toBe(
      "image/png",
    );
    expect(
      classifyMediaValue("https://x.com/a/song.mp3?sig=1")?.contentType,
    ).toBe("audio/mpeg");
  });

  it("ignores non-media and malformed inputs", () => {
    expect(classifyMediaValue("https://example.com/page")).toBeNull();
    expect(classifyMediaValue("just a string")).toBeNull();
    expect(classifyMediaValue(`Compare ${ref} against this.`)).toBeNull();
    expect(classifyMediaValue("@@@langfuseMedia:garbage@@@")).toBeNull();
    expect(classifyMediaValue(42)).toBeNull();
    expect(classifyMediaValue(null)).toBeNull();
    expect(classifyMediaValue("")).toBeNull();
  });

  it("does not parse oversized malformed media references", () => {
    expect(
      classifyMediaValue(`@@@langfuseMedia:${"x".repeat(1000)}@@@`),
    ).toBeNull();
  });

  it("splits valid media references out of larger strings", () => {
    expect(splitStringByMediaReferences(`{"image":"${ref}"}`)).toEqual([
      { type: "text", value: '{"image":"' },
      {
        type: "media",
        value: ref,
        descriptor: {
          kind: "langfuseRef",
          contentType: "image/png",
          mediaId: "cc48838a-3da8-4ca4-a007-2cf8df930e69",
          referenceString: ref,
        },
      },
      { type: "text", value: '"}' },
    ]);
  });
});
