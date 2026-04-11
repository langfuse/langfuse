import { fireEvent, render, screen } from "@testing-library/react";
import { SpielwieseModelRecommendationPanel } from "./SpielwieseModelRecommendationPanel";

const target = {
  currentModel: "gpt-4.1",
  nodeId: "vision-agent",
  nodeTitle: "Vision Agent",
  providerLabel: "OpenAI",
};

describe("SpielwieseModelRecommendationPanel", () => {
  it("renders recommendation options with the same chrome as panel controls", () => {
    render(<SpielwieseModelRecommendationPanel target={target} />);

    const option = screen.getByRole("button", { name: "Reasoning" });

    expect(option.getAttribute("aria-pressed")).toBe("false");
    expect(option.className).toContain("rounded-lg");
    expect(option.className).toContain("border");
    expect(option.className).toContain(
      "shadow-[inset_0_1px_0_hsl(var(--background)/0.96)]",
    );
    expect(option.className).toContain("bg-background/88");
  });

  it("marks the selected recommendation option as active", () => {
    render(<SpielwieseModelRecommendationPanel target={target} />);

    const reasoning = screen.getByRole("button", { name: "Reasoning" });
    const vision = screen.getByRole("button", { name: "Vision" });

    fireEvent.click(vision);

    expect(reasoning.getAttribute("aria-pressed")).toBe("false");
    expect(vision.getAttribute("aria-pressed")).toBe("true");
  });
});
