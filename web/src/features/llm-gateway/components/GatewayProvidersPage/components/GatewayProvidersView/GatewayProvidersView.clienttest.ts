import { describe, expect, it } from "vitest";

import { getProviderReorder, reorderProviderIds } from "./GatewayProvidersView";

describe("provider credential reordering", () => {
  it("moves credentials in both directions", () => {
    expect(
      reorderProviderIds(["openai", "anthropic"], "openai", "anthropic"),
    ).toEqual(["anthropic", "openai"]);
    expect(
      reorderProviderIds(["anthropic", "openai"], "openai", "anthropic"),
    ).toEqual(["openai", "anthropic"]);
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
