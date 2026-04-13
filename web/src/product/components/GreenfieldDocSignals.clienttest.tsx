import { fireEvent, render, screen } from "@testing-library/react";
import { GreenfieldDocSignals } from "./GreenfieldDocSignals";

describe("GreenfieldDocSignals", () => {
  it("renders overview indicators and reveals the doc-backed hover copy", async () => {
    render(<GreenfieldDocSignals section="overview" />);

    expect(screen.getByText("Readiness signals")).toBeTruthy();
    const trigger = screen.getByRole("button", {
      name: "Tracing live indicator",
    });

    expect(trigger).toBeTruthy();

    fireEvent.pointerEnter(trigger);
    fireEvent.focus(trigger);

    expect(
      await screen.findByText(
        "Greenfield does not show whether this project is sending traces yet.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Without this, users cannot tell if evaluation and monitoring can work at all.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Put this in the Overview readiness strip at the top of the page.",
      ),
    ).toBeTruthy();

    const startTracingLink = await screen.findByRole("link", {
      name: "Start Tracing",
    });

    expect(startTracingLink.getAttribute("href")).toBe(
      "https://langfuse.com/docs/observability/get-started",
    );
  });

  it("renders stage-specific prompt signals", () => {
    render(<GreenfieldDocSignals section="deploy" />);

    expect(screen.getByText("Release signals")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Live label set indicator" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Automation hook indicator" }),
    ).toBeTruthy();
  });
});
