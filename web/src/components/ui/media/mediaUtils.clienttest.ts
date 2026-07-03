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

  it("ignores non-previewable data URIs", () => {
    expect(classifyMediaValue("data:text/plain,hello")).toBeNull();
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
