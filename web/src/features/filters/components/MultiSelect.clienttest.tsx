import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { type FilterOption } from "@langfuse/shared";

import { MultiSelect } from "./MultiSelect";

/** Keeps `values` in state, as callers do, so selections round-trip. */
function ControlledMultiSelect({
  initialValues,
  options,
  onValueChange,
}: {
  initialValues: string[];
  options: FilterOption[];
  onValueChange?: (values: string[]) => void;
}) {
  const [values, setValues] = useState(initialValues);
  return (
    <MultiSelect
      values={values}
      options={options}
      onValueChange={(next) => {
        setValues(next);
        onValueChange?.(next);
      }}
      isCustomSelectEnabled
    />
  );
}

const userOptions: FilterOption[] = [{ value: "user-1" }, { value: "user-2" }];

function optionRowsWithText(text: string) {
  return screen
    .getAllByRole("option")
    .filter((row) => row.textContent?.trim() === text);
}

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

  it("lists a selected custom value once, in the custom value row", () => {
    render(
      <ControlledMultiSelect
        initialValues={["ghost-user"]}
        options={userOptions}
      />,
    );

    fireEvent.click(screen.getByRole("button"));

    expect(optionRowsWithText("ghost-user")).toHaveLength(0);
    expect(screen.getByPlaceholderText("Enter custom value")).toHaveValue(
      "ghost-user",
    );
  });

  it("selects the same values every time Select All is used", () => {
    const onValueChange = vi.fn();
    render(
      <ControlledMultiSelect
        initialValues={["ghost-user"]}
        options={userOptions}
        onValueChange={onValueChange}
      />,
    );
    fireEvent.click(screen.getByRole("button"));

    fireEvent.click(screen.getByText("Select All"));
    const firstSelectAll = onValueChange.mock.lastCall?.[0];
    fireEvent.click(screen.getByText("Deselect All"));
    fireEvent.click(screen.getByText("Select All"));

    expect(onValueChange.mock.lastCall?.[0]).toEqual(firstSelectAll);
  });

  it("keeps a selected custom value through Deselect All", () => {
    const onValueChange = vi.fn();
    render(
      <ControlledMultiSelect
        initialValues={["ghost-user", "user-1"]}
        options={userOptions}
        onValueChange={onValueChange}
      />,
    );
    fireEvent.click(screen.getByRole("button"));

    fireEvent.click(screen.getByText("Select All"));
    fireEvent.click(screen.getByText("Deselect All"));

    expect(onValueChange.mock.lastCall?.[0]).toEqual(["ghost-user"]);
  });

  it("shows a custom value that the caller replaces", () => {
    const { rerender } = render(
      <MultiSelect
        values={["first-value"]}
        options={[]}
        onValueChange={vi.fn()}
        isCustomSelectEnabled
      />,
    );
    rerender(
      <MultiSelect
        values={["second-value"]}
        options={[]}
        onValueChange={vi.fn()}
        isCustomSelectEnabled
      />,
    );

    fireEvent.click(screen.getByRole("button"));

    expect(screen.getByPlaceholderText("Enter custom value")).toHaveValue(
      "second-value",
    );
  });

  it("keeps typing when an earlier custom value comes back from the caller", () => {
    vi.useFakeTimers();
    try {
      const onValueChange = vi.fn();
      const { rerender } = render(
        <MultiSelect
          values={["a"]}
          options={[]}
          onValueChange={onValueChange}
          isCustomSelectEnabled
        />,
      );
      fireEvent.click(screen.getByRole("button"));
      const input = screen.getByPlaceholderText("Enter custom value");

      fireEvent.change(input, { target: { value: "ab" } });
      vi.advanceTimersByTime(500);
      expect(onValueChange).toHaveBeenLastCalledWith(["ab"]);
      fireEvent.change(input, { target: { value: "abc" } });
      rerender(
        <MultiSelect
          values={["ab"]}
          options={[]}
          onValueChange={onValueChange}
          isCustomSelectEnabled
        />,
      );

      expect(input).toHaveValue("abc");
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears the custom value row once a selected value turns up in the options", () => {
    const { rerender } = render(
      <MultiSelect
        values={["user-1"]}
        options={[]}
        onValueChange={vi.fn()}
        isCustomSelectEnabled
      />,
    );
    rerender(
      <MultiSelect
        values={["user-1"]}
        options={userOptions}
        onValueChange={vi.fn()}
        isCustomSelectEnabled
      />,
    );

    fireEvent.click(screen.getByRole("button"));

    expect(screen.getByPlaceholderText("Enter custom value")).toHaveValue("");
    expect(optionRowsWithText("user-1")).toHaveLength(1);
  });
});
