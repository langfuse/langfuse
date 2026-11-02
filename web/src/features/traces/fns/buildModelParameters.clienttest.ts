// @vitest-environment node

import { describe, expect, it } from "vitest";
import { buildModelParameters } from "./buildModelParameters";

describe("buildModelParameters", () => {
  it("keeps the call's parameters as their own table and drops empty ones", () => {
    expect(
      buildModelParameters({ temperature: 0.2, top_p: null, tools: ["a"] }),
    ).toEqual({ temperature: 0.2, tools: ["a"] });
    expect(buildModelParameters({})).toBeNull();
    expect(buildModelParameters(null)).toBeNull();
    expect(buildModelParameters("gpt-4" as unknown as null)).toBeNull();
  });
});
