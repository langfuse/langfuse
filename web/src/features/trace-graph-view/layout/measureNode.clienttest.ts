import {
  APPROX_CHAR_WIDTH,
  MAX_LABEL_LENGTH,
  MAX_WIDTH,
  MIN_WIDTH,
  NODE_HEIGHT,
  measureNode,
  truncateLabel,
} from "./measureNode";

describe("truncateLabel", () => {
  it("keeps a label exactly at MAX_LABEL_LENGTH unchanged", () => {
    const label = "x".repeat(MAX_LABEL_LENGTH);
    expect(truncateLabel(label)).toBe(label);
  });

  it("truncates labels beyond MAX_LABEL_LENGTH with an ellipsis", () => {
    const label = "x".repeat(MAX_LABEL_LENGTH + 5);
    const truncated = truncateLabel(label);
    expect(truncated).toBe(`${"x".repeat(MAX_LABEL_LENGTH - 1)}…`);
    expect(truncated.length).toBeLessThanOrEqual(MAX_LABEL_LENGTH);
  });

  it("does not leave a trailing space before the ellipsis", () => {
    // The character at the cut position is a space, which a plain slice would
    // keep as "xxx …" — trimEnd must remove it before the ellipsis.
    const label = `${"x".repeat(MAX_LABEL_LENGTH - 2)} ${"y".repeat(10)}`;
    const truncated = truncateLabel(label);
    expect(truncated).toBe(`${"x".repeat(MAX_LABEL_LENGTH - 2)}…`);
    expect(truncated).not.toMatch(/\s…$/);
  });
});

describe("measureNode", () => {
  it("floors short labels at MIN_WIDTH and uses the fixed NODE_HEIGHT", () => {
    const { width, height } = measureNode({ label: "ab" });
    expect(width).toBe(MIN_WIDTH);
    expect(height).toBe(NODE_HEIGHT);
  });

  it("bounds very long labels with a counter reserve at the widened cap", () => {
    const counterChars = " (12/12)".length;
    const wide = measureNode({ label: "x".repeat(500) }, counterChars);
    const wider = measureNode({ label: "x".repeat(5000) }, counterChars);

    // Truncation makes the width independent of the raw label length…
    expect(wider.width).toBe(wide.width);
    // …and it never exceeds the cap widened by the counter reserve.
    expect(wide.width).toBeLessThanOrEqual(
      Math.round(MAX_WIDTH + counterChars * APPROX_CHAR_WIDTH),
    );
    // The reserve itself widens the node vs. the same label without one.
    const noReserve = measureNode({ label: "x".repeat(500) });
    expect(wide.width).toBeGreaterThan(noReserve.width);
  });
});
