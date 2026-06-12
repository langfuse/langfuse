import {
  EncodedScoresCursorV3,
  encodeCursorV3,
} from "@/src/features/public-api/types/scores";

describe("Scores v3 cursor", () => {
  it("encode → decode round-trip preserves v, lastTimestamp, lastId", () => {
    const timestamp = new Date("2026-06-01T12:34:56.789Z");
    const encoded = encodeCursorV3({
      v: 1,
      lastTimestamp: timestamp,
      lastId: "abc-123",
    });
    const decoded = EncodedScoresCursorV3.parse(encoded);

    expect(decoded.v).toBe(1);
    expect(decoded.lastTimestamp).toEqual(timestamp);
    expect(decoded.lastId).toBe("abc-123");
  });

  it("rejects cursor missing the v discriminator", () => {
    const unversioned = Buffer.from(
      JSON.stringify({
        lastTimestamp: new Date().toISOString(),
        lastId: "x",
      }),
    ).toString("base64url");

    expect(() => EncodedScoresCursorV3.parse(unversioned)).toThrow();
  });

  it("rejects cursor with unknown version", () => {
    const future = Buffer.from(
      JSON.stringify({
        v: 99,
        lastTimestamp: new Date().toISOString(),
        lastId: "x",
      }),
    ).toString("base64url");

    expect(() => EncodedScoresCursorV3.parse(future)).toThrow();
  });
});
