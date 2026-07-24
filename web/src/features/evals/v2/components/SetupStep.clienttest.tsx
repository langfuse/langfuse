import { fireEvent, render, screen } from "@testing-library/react";

import { SetupStep } from "./SetupStep";

describe("SetupStep", () => {
  it("shows its description and content only while expanded", () => {
    render(
      <SetupStep
        number={1}
        title="Select sample data"
        description="Choose a representative observation."
        defaultOpen={false}
      >
        <div>Step content</div>
      </SetupStep>,
    );

    expect(
      screen.queryByText("Choose a representative observation."),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Step content")).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /select sample data/i }),
    );

    expect(
      screen.getByText("Choose a representative observation."),
    ).toBeVisible();
    expect(screen.getByText("Step content")).toBeVisible();
  });
});
