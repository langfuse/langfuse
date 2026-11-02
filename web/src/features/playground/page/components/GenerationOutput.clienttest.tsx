import { render, screen } from "@testing-library/react";

import { GenerationOutput } from "./GenerationOutput";

vi.mock("../context/PlaygroundProvider", () => ({
  usePlaygroundContext: () => ({
    output: "customer-generated output",
    outputReasoning: "",
    outputJson: '{"secret":"customer-generated output"}',
    addMessage: vi.fn(),
    outputToolCalls: [],
    scrollToMessage: vi.fn(),
  }),
}));

describe("GenerationOutput session recording privacy", () => {
  it("blocks generated output from PostHog session recordings", () => {
    render(<GenerationOutput />);

    expect(screen.getByText("customer-generated output")).toHaveClass(
      "ph-no-capture",
    );
  });
});
