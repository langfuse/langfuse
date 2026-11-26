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
      title="Search"
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

  it("adds a custom value once and keeps Select All aligned with visible options", () => {
    const onValuesChange = vi.fn();
    render(
      <ControlledMultiSelect
        options={[{ value: "user-1" }, { value: "user-2" }]}
        onValuesChange={onValuesChange}
      />,
    );

    fireEvent.click(screen.getByRole("button"));
    const dialog = screen.getByRole("dialog");
    const search = screen.getByPlaceholderText("Search");

    fireEvent.change(search, { target: { value: "ghost-user" } });
    fireEvent.click(within(dialog).getByRole("option", { name: /ghost-user/ }));

    expect(within(dialog).getAllByText("ghost-user")).toHaveLength(1);
    expect(onValuesChange).toHaveBeenLastCalledWith(["ghost-user"]);

    fireEvent.change(search, { target: { value: "ghost-user" } });
    expect(within(dialog).queryByText(/Use/)).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: "" } });
    fireEvent.click(within(dialog).getByText("Select All"));
    expect(new Set(onValuesChange.mock.lastCall?.[0] as string[])).toEqual(
      new Set(["ghost-user", "user-1", "user-2"]),
    );

    fireEvent.click(within(dialog).getByText("Deselect All"));
    expect(onValuesChange).toHaveBeenLastCalledWith([]);
    expect(within(dialog).queryByText("ghost-user")).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByText("Select All"));
    expect(new Set(onValuesChange.mock.lastCall?.[0] as string[])).toEqual(
      new Set(["user-1", "user-2"]),
    );
  });
});
