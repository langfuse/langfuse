import { describe, expect, it } from "vitest";
import { classifyMediaLeaf } from "@/src/components/ui/media/classifyMediaLeaf";

describe("classifyMediaLeaf", () => {
  const ref =
    "@@@langfuseMedia:type=image/png|id=cc48838a-3da8-4ca4-a007-2cf8df930e69|source=bytes@@@";

  it("parses a Langfuse media reference", () => {
    expect(classifyMediaLeaf(ref)).toEqual({
      kind: "langfuseRef",
      contentType: "image/png",
      mediaId: "cc48838a-3da8-4ca4-a007-2cf8df930e69",
      referenceString: ref,
    });
  });

  it("parses a data URI by its MIME head, not the whole payload", () => {
    const src = "data:image/jpeg;base64," + "A".repeat(5000);
    expect(classifyMediaLeaf(src)).toEqual({
      kind: "dataUri",
      contentType: "image/jpeg",
      src,
    });
  });

  it("ignores non-previewable data URIs", () => {
    expect(classifyMediaLeaf("data:text/plain,hello")).toBeNull();
  });

  it("classifies image/audio/video URLs by extension", () => {
    expect(classifyMediaLeaf("https://x.com/a/b.png")?.contentType).toBe(
      "image/png",
    );
    expect(
      classifyMediaLeaf("https://x.com/a/song.mp3?sig=1")?.contentType,
    ).toBe("audio/mpeg");
  });

  it("ignores non-media and malformed inputs", () => {
    expect(classifyMediaLeaf("https://example.com/page")).toBeNull();
    expect(classifyMediaLeaf("just a string")).toBeNull();
    expect(classifyMediaLeaf(`Compare ${ref} against this.`)).toBeNull();
    expect(classifyMediaLeaf("@@@langfuseMedia:garbage@@@")).toBeNull();
    expect(classifyMediaLeaf(42)).toBeNull();
    expect(classifyMediaLeaf(null)).toBeNull();
    expect(classifyMediaLeaf("")).toBeNull();
  });

  it("does not parse oversized malformed media references", () => {
    expect(
      classifyMediaLeaf(`@@@langfuseMedia:${"x".repeat(1000)}@@@`),
    ).toBeNull();
  });
});
