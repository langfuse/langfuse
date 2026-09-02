import { fireEvent, render, screen, within } from "@testing-library/react";

import { MultiSelect } from "./multi-select";

vi.stubGlobal(
  "ResizeObserver",
  class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);
Element.prototype.scrollIntoView = vi.fn();

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

  it("shows edits to a selected custom value immediately", () => {
    render(
      <MultiSelect
        values={["draft-value"]}
        options={[]}
        onValueChange={vi.fn()}
        isCustomSelectEnabled
      />,
    );

    const trigger = screen.getByRole("button");
    fireEvent.click(trigger);
    fireEvent.change(screen.getByPlaceholderText("Enter custom value"), {
      target: { value: "edited-value" },
    });

    expect(within(trigger).getByText("edited-value")).toBeInTheDocument();
    expect(within(trigger).queryByText("draft-value")).not.toBeInTheDocument();
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
