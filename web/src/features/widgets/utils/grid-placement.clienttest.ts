import { pushDownForInsertion } from "./grid-placement";

const tile = (id: string, x: number, y: number, x_size = 6, y_size = 6) => ({
  id,
  x,
  y,
  x_size,
  y_size,
});

describe("pushDownForInsertion", () => {
  it("leaves tiles alone when the inserted rect is free", () => {
    const existing = [tile("a", 0, 0), tile("b", 0, 6)];
    const result = pushDownForInsertion(existing, {
      x: 6,
      y: 0,
      x_size: 6,
      y_size: 6,
    });

    expect(result).toEqual(existing);
    // pure: inputs untouched, outputs are copies
    expect(result[0]).not.toBe(existing[0]);
  });

  it("pushes an occupying tile below the inserted rect", () => {
    const result = pushDownForInsertion(
      [tile("a", 0, 0), tile("right-neighbor", 6, 0)],
      { x: 6, y: 0, x_size: 6, y_size: 6 },
    );

    expect(result.find((w) => w.id === "a")?.y).toBe(0);
    expect(result.find((w) => w.id === "right-neighbor")?.y).toBe(6);
  });

  it("cascades pushes onto tiles further down the column", () => {
    const result = pushDownForInsertion(
      [tile("top", 6, 0), tile("below", 6, 6)],
      { x: 6, y: 0, x_size: 6, y_size: 6 },
    );

    expect(result.find((w) => w.id === "top")?.y).toBe(6);
    expect(result.find((w) => w.id === "below")?.y).toBe(12);
  });

  it("does not disturb other columns during a cascade", () => {
    const result = pushDownForInsertion(
      [tile("pushed", 6, 0), tile("left-below", 0, 6)],
      { x: 6, y: 0, x_size: 6, y_size: 6 },
    );

    expect(result.find((w) => w.id === "pushed")?.y).toBe(6);
    expect(result.find((w) => w.id === "left-below")?.y).toBe(6);
  });

  it("pushes partially overlapping tiles of different sizes", () => {
    // inserted 6-wide rect overlaps a 4-wide tile shifted right of it
    const result = pushDownForInsertion([tile("narrow", 8, 0, 4, 3)], {
      x: 6,
      y: 0,
      x_size: 6,
      y_size: 6,
    });

    expect(result.find((w) => w.id === "narrow")?.y).toBe(6);
  });
});
