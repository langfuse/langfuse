import { describe, expect, it } from "vitest";

import {
  getProviderReorder,
  hasProviderPositionChanged,
} from "./GatewayProvidersView";

describe("provider credential reordering", () => {
  it("detects movement in both directions", () => {
    expect(
      hasProviderPositionChanged(
        "openai",
        ["openai", "anthropic"],
        ["anthropic", "openai"],
      ),
    ).toBe(true);
    expect(
      hasProviderPositionChanged(
        "openai",
        ["anthropic", "openai"],
        ["openai", "anthropic"],
      ),
    ).toBe(true);
  });

  it("maps a completed drag to the source and target credentials", () => {
    expect(
      getProviderReorder(
        {
          active: { id: "openai" },
          over: { id: "anthropic" },
        } as Parameters<typeof getProviderReorder>[0],
        true,
      ),
    ).toEqual({ sourceId: "openai", targetId: "anthropic" });
  });

  it("ignores disabled and unchanged drags", () => {
    const drag = {
      active: { id: "openai" },
      over: { id: "openai" },
    } as Parameters<typeof getProviderReorder>[0];

    expect(getProviderReorder(drag, true)).toBeNull();
    expect(getProviderReorder(drag, false)).toBeNull();
  });
});
