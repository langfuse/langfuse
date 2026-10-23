// @vitest-environment node

import { describe, expect, it } from "vitest";
import { packetKeyframes } from "./keyframes";

describe("packetKeyframes", () => {
  it("takes as long as the path at the given speed and ends hidden at its last point", () => {
    const keyframes = packetKeyframes(
      "p",
      [
        [0, 0],
        [0, 40],
        [30, 40],
      ],
      0.2,
    );

    expect(keyframes.duration).toBe(350);
    expect(keyframes.css).toContain(
      "100% { opacity: 0; transform: translate(30px, 40px); }",
    );
  });
});
