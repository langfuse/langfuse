import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AgentAppearancePicker } from "./AgentAppearancePicker";
import { AgentIdentity } from "./AgentIdentity";
import { agentAppearanceKey } from "./appearance";
import { useAgentAppearanceStore } from "./appearanceStore";

beforeEach(() => useAgentAppearanceStore.setState({ overrides: {} }));

describe("shared appearance picker", () => {
  it("updates the exact agent's persisted preference and retains a privacy boundary in its portal", async () => {
    render(
      <>
        <AgentIdentity projectId="p" agentName="résumé/.." />
        <AgentAppearancePicker projectId="p" agentName="résumé/.." />
      </>,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Customize résumé/.. appearance" }),
    );
    const color = await screen.findByRole("button", {
      name: "Cyan",
    });
    expect(color.closest(".ph-no-capture")).not.toBeNull();
    fireEvent.click(color);
    fireEvent.click(screen.getByRole("button", { name: "rocket" }));
    const key = agentAppearanceKey("p", "résumé/..");
    expect(useAgentAppearanceStore.getState().overrides[key]).toEqual({
      color: "#22d3ee",
      glyph: { kind: "icon", id: "rocket" },
    });
    expect(screen.getByRole("button", { name: "Cyan" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const persisted = JSON.parse(
      window.localStorage.getItem("langfuse-agent-appearance-v1")!,
    );
    expect(persisted.state.overrides[key]).toEqual(
      useAgentAppearanceStore.getState().overrides[key],
    );
  });
  it("supports mascot selection and resets only the current agent", async () => {
    const custom = {
      color: "#22d3ee",
      glyph: { kind: "icon" as const, id: "rocket" as const },
    };
    useAgentAppearanceStore.getState().set("p", "other", custom);
    render(<AgentAppearancePicker projectId="p" agentName="research" />);
    fireEvent.click(
      screen.getByRole("button", { name: "Customize research appearance" }),
    );
    fireEvent.mouseDown(await screen.findByRole("tab", { name: "Mascots" }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(await screen.findByRole("button", { name: "cat" }));
    expect(
      useAgentAppearanceStore.getState().overrides[
        agentAppearanceKey("p", "research")
      ]?.glyph,
    ).toEqual({ kind: "mascot", id: "cat" });
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    await waitFor(() =>
      expect(
        useAgentAppearanceStore.getState().overrides[
          agentAppearanceKey("p", "research")
        ],
      ).toBeUndefined(),
    );
    expect(
      useAgentAppearanceStore.getState().overrides[
        agentAppearanceKey("p", "other")
      ],
    ).toEqual(custom);
  });
});
