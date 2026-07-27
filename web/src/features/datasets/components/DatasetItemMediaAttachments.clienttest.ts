import { describe, expect, it } from "vitest";

import {
  collectMediaReferenceStrings,
  getMediaReferenceInsertRange,
} from "./DatasetItemMediaAttachments";

const imageRef =
  "@@@langfuseMedia:type=image/png|id=cc48838a-3da8-4ca4-a007-2cf8df930e69|source=bytes@@@";
const audioRef =
  "@@@langfuseMedia:type=audio/wav|id=5b8f1c2d-0a9e-4f3b-8d6c-7e2a1f4b9c0d|source=bytes@@@";

describe("collectMediaReferenceStrings", () => {
  it("collects references from valid JSON values", () => {
    expect(
      collectMediaReferenceStrings([
        JSON.stringify({ image: imageRef, audio: audioRef }),
      ]),
    ).toEqual([imageRef, audioRef]);
  });

  it("keeps strict whole-value matching for valid JSON", () => {
    expect(
      collectMediaReferenceStrings([
        JSON.stringify({ text: `Compare ${imageRef} against this.` }),
      ]),
    ).toEqual([]);
  });

  it("falls back to regex collection for invalid JSON", () => {
    expect(collectMediaReferenceStrings([`{ "image": "${imageRef}",`])).toEqual(
      [imageRef],
    );
  });

  it("dedupes references by media id across valid and invalid fields", () => {
    expect(
      collectMediaReferenceStrings([
        JSON.stringify({ image: imageRef }),
        `{ "image": "${imageRef}",`,
      ]),
    ).toEqual([imageRef]);
  });
});

describe("getMediaReferenceInsertRange", () => {
  const doc = (value: string) => ({
    length: value.length,
    sliceString: (from: number, to?: number) => value.slice(from, to),
  });

  it("replaces an empty JSON string when the cursor is between the quotes", () => {
    expect(
      getMediaReferenceInsertRange(doc('{ "image": "" }'), 12, 12),
    ).toEqual({ from: 11, to: 13 });
  });

  it("replaces a selected empty JSON string", () => {
    expect(
      getMediaReferenceInsertRange(doc('{ "image": "" }'), 11, 13),
    ).toEqual({ from: 11, to: 13 });
  });

  it("keeps normal insertion ranges unchanged", () => {
    expect(
      getMediaReferenceInsertRange(doc('{ "image": null }'), 11, 15),
    ).toEqual({ from: 11, to: 15 });
  });

  it("does not replace non-empty JSON string boundaries", () => {
    expect(
      getMediaReferenceInsertRange(doc('{ "image": "x" }'), 12, 12),
    ).toEqual({ from: 12, to: 12 });
  });
});
