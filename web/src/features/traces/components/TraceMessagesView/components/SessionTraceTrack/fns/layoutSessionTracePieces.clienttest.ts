import { describe, expect, it } from "vitest";
import { layoutSessionTracePieces } from "./layoutSessionTracePieces";

describe("layoutSessionTracePieces", () => {
  it("keeps a trace that starts at the same time as the one before it", () => {
    const start = Date.parse("2026-03-14T14:00:00.000Z");
    const { pieces } = layoutSessionTracePieces(
      [
        { id: "first", name: "first", start, end: start + 60_000 },
        { id: "same", name: "same", start, end: start },
      ],
      0,
    );
    const traces = pieces.filter((piece) => piece.trace);
    expect(traces.map((piece) => piece.trace?.id)).toEqual(["first", "same"]);
  });
});
