import { describe, expect, it } from "vitest";

import { findMediaReferences } from "./mediaReferences";

const imageRef =
  "@@@langfuseMedia:type=image/png|id=cc48838a-3da8-4ca4-a007-2cf8df930e69|source=base64@@@";
const audioRef =
  "@@@langfuseMedia:type=audio/wav|id=5b8f1c2d-0a9e-4f3b-8d6c-7e2a1f4b9c0d|source=bytes@@@";

describe("findMediaReferences", () => {
  it("finds a reference that is the whole string value", () => {
    expect(findMediaReferences({ image: imageRef })).toEqual([
      {
        type: "image/png",
        id: "cc48838a-3da8-4ca4-a007-2cf8df930e69",
        source: "base64",
        referenceString: imageRef,
        jsonPath: "$['image']",
      },
    ]);
  });

  it("finds references in nested objects and arrays", () => {
    const value = {
      messages: [
        { role: "user", content: [{ type: "image_url", image_url: imageRef }] },
      ],
    };

    expect(findMediaReferences(value)).toMatchObject([
      { jsonPath: "$['messages'][0]['content'][0]['image_url']" },
    ]);
  });

  it("finds multiple references across fields", () => {
    const value = { candidate: imageRef, recording: audioRef };

    expect(findMediaReferences(value)).toMatchObject([
      {
        id: "cc48838a-3da8-4ca4-a007-2cf8df930e69",
        jsonPath: "$['candidate']",
      },
      {
        id: "5b8f1c2d-0a9e-4f3b-8d6c-7e2a1f4b9c0d",
        jsonPath: "$['recording']",
      },
    ]);
  });

  it("ignores references embedded in surrounding text", () => {
    expect(
      findMediaReferences({ text: `Compare ${imageRef} against this.` }),
    ).toEqual([]);
  });

  it("handles objects with a literal 'match' key", () => {
    expect(findMediaReferences({ match: imageRef })).toMatchObject([
      { jsonPath: "$['match']" },
    ]);
  });

  it("handles non-identifier keys", () => {
    expect(findMediaReferences({ "my image": imageRef })).toMatchObject([
      { jsonPath: "$['my image']" },
    ]);
  });

  it("skips malformed reference strings", () => {
    expect(
      findMediaReferences({ broken: "@@@langfuseMedia:no-key-value@@@" }),
    ).toEqual([]);
  });

  it("returns an empty list for scalars and null", () => {
    expect(findMediaReferences(null)).toEqual([]);
    expect(findMediaReferences(42)).toEqual([]);
    expect(findMediaReferences("plain text")).toEqual([]);
  });

  it("finds a reference at the root string", () => {
    expect(findMediaReferences(imageRef)).toMatchObject([{ jsonPath: "$" }]);
  });
});
