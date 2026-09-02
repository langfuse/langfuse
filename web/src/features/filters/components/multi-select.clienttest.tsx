import { render, screen } from "@testing-library/react";

import { MultiSelect } from "./multi-select";

describe("MultiSelect", () => {
  it("shows a selected value that is missing from the current options", () => {
    render(
      <MultiSelect
        values={["GENERATION"]}
        options={[]}
        onValueChange={vi.fn()}
      />,
    );

    expect(screen.getByText("GENERATION")).toBeInTheDocument();
  });

  it("summarizes several selected values that are missing from the options", () => {
    render(
      <MultiSelect
        values={["one", "two", "three", "four", "five", "six"]}
        options={[]}
        onValueChange={vi.fn()}
      />,
    );

    expect(screen.getByText("6 selected")).toBeInTheDocument();
  });
});
