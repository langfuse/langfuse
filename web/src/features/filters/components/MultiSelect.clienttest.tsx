import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";

import { MultiSelect } from "./MultiSelect";

vi.stubGlobal(
  "ResizeObserver",
  class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);
Element.prototype.scrollIntoView = vi.fn();

function ControlledMultiSelect({
  options,
  onValuesChange,
}: {
  options: { value: string; displayValue?: string }[];
  onValuesChange: (values: string[]) => void;
}) {
  const [values, setValues] = useState<string[]>([]);
  return (
    <MultiSelect
      values={values}
      options={options}
      onValueChange={(next) => {
        setValues(next);
        onValuesChange(next);
      }}
      isCustomSelectEnabled
    />
  );
}

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

  it("lists a selected custom value once and toggles the same set with Select All", () => {
    const onValuesChange = vi.fn();
    render(
      <ControlledMultiSelect
        options={[{ value: "user-1" }, { value: "user-2" }]}
        onValuesChange={onValuesChange}
      />,
    );

    fireEvent.click(screen.getByRole("button"));
    const dialog = screen.getByRole("dialog");
    const customInput = screen.getByPlaceholderText("Enter custom value");

    fireEvent.change(customInput, { target: { value: "ghost-user" } });
    fireEvent.click(customInput.closest("[role='option']")!);

    expect(within(dialog).queryByText("ghost-user")).not.toBeInTheDocument();
    expect(customInput).toHaveValue("ghost-user");

    fireEvent.click(within(dialog).getByText("Select All"));
    const firstSelectAll = new Set(
      onValuesChange.mock.lastCall?.[0] as string[],
    );
    expect(firstSelectAll).toEqual(new Set(["ghost-user", "user-1", "user-2"]));

    fireEvent.click(within(dialog).getByText("Deselect All"));
    expect(onValuesChange).toHaveBeenLastCalledWith([]);

    fireEvent.click(within(dialog).getByText("Select All"));
    expect(new Set(onValuesChange.mock.lastCall?.[0] as string[])).toEqual(
      firstSelectAll,
    );
  });

  it("clears the custom row once loaded options include a preselected value", () => {
    const { rerender } = render(
      <MultiSelect
        values={["key-1"]}
        options={[]}
        onValueChange={vi.fn()}
        isCustomSelectEnabled
      />,
    );

    rerender(
      <MultiSelect
        values={["key-1"]}
        options={[{ value: "key-1", displayValue: "Primary key" }]}
        onValueChange={vi.fn()}
        isCustomSelectEnabled
      />,
    );

    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByPlaceholderText("Enter custom value")).toHaveValue("");
  });
});
