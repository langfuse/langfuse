import {
  agentAppearanceKey,
  defaultAgentAppearance,
  parseAgentAppearance,
} from "./appearance";
import { useAgentAppearanceStore } from "./appearanceStore";

describe("agent appearance preferences", () => {
  beforeEach(() => useAgentAppearanceStore.setState({ overrides: {} }));
  it("namespaces exact names and projects without delimiter collisions or case folding", () => {
    const names = [".", "..", "agent/a", "agent:A", "agent:a", "résumé 🤖"];
    expect(
      new Set(names.map((name) => agentAppearanceKey("p", name))).size,
    ).toBe(names.length);
    expect(agentAppearanceKey("p:a", "b")).not.toBe(
      agentAppearanceKey("p", "a:b"),
    );
    expect(defaultAgentAppearance("p", "research")).toEqual(
      defaultAgentAppearance("p", "research"),
    );
    const selected = {
      color: "#22d3ee",
      glyph: { kind: "emoji" as const, value: "👩🏽‍💻" },
    };
    useAgentAppearanceStore.getState().set("p", "..", selected);
    expect(
      useAgentAppearanceStore.getState().overrides[
        agentAppearanceKey("p", "..")
      ],
    ).toEqual(selected);
    expect(
      useAgentAppearanceStore.getState().overrides[
        agentAppearanceKey("q", "..")
      ],
    ).toBeUndefined();
    useAgentAppearanceStore.getState().set("p", "a", selected);
    useAgentAppearanceStore.getState().reset("p", "..");
    expect(
      useAgentAppearanceStore.getState().overrides[
        agentAppearanceKey("p", "a")
      ],
    ).toEqual(selected);
  });
  it("validates persisted glyphs, colors and single emoji graphemes before rendering", () => {
    expect(
      parseAgentAppearance({
        color: "url(https://invalid)",
        glyph: { kind: "icon", id: "bot" },
      }),
    ).toBeNull();
    expect(
      parseAgentAppearance({
        color: "#AABBCC",
        glyph: { kind: "icon", id: "unknown" },
      }),
    ).toBeNull();
    expect(
      parseAgentAppearance({
        color: "#AABBCC",
        glyph: { kind: "emoji", value: "🤖🎉" },
      }),
    ).toBeNull();
    expect(
      parseAgentAppearance({
        color: "#AABBCC",
        glyph: { kind: "emoji", value: "👩🏽‍💻" },
      }),
    ).toEqual({ color: "#aabbcc", glyph: { kind: "emoji", value: "👩🏽‍💻" } });
    expect(
      parseAgentAppearance({
        color: "#AABBCC",
        glyph: { kind: "mascot", id: "cat" },
      }),
    ).toEqual({ color: "#aabbcc", glyph: { kind: "mascot", id: "cat" } });
  });
});
