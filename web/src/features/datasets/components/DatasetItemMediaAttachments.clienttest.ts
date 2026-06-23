import { describe, expect, it } from "vitest";

import { collectMediaReferenceStrings } from "./DatasetItemMediaAttachments";

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
