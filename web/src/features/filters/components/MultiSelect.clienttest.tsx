import { useState } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";

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
  initialValues = [],
  options,
  onValuesChange,
}: {
  initialValues?: string[];
  options: { value: string; displayValue?: string }[];
  onValuesChange?: (values: string[]) => void;
}) {
  const [values, setValues] = useState(initialValues);
  const handleValueChange = (nextValues: string[]) => {
    setValues(nextValues);
    onValuesChange?.(nextValues);
  };
  return (
    <MultiSelect
      values={values}
      options={options}
      onValueChange={handleValueChange}
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

    const trigger = screen.getByRole("button");
    fireEvent.click(trigger);

    const customInput = screen.getByPlaceholderText("Enter custom value");
    fireEvent.change(customInput, { target: { value: "ghost-user" } });
    fireEvent.click(customInput.closest("[role='option']")!);

    const dialog = screen.getByRole("dialog");
    expect(within(trigger).getByText("ghost-user")).toBeInTheDocument();
    expect(within(dialog).queryByText("ghost-user")).not.toBeInTheDocument();
    expect(customInput).toHaveValue("ghost-user");
    expect(onValuesChange).toHaveBeenLastCalledWith(["ghost-user"]);

    fireEvent.click(within(dialog).getByText("Select All"));
    const firstSelectAllValues = onValuesChange.mock.lastCall?.[0] as string[];
    expect(new Set(firstSelectAllValues)).toEqual(
      new Set(["ghost-user", "user-1", "user-2"]),
    );
    expect(within(trigger).getByText("3 selected")).toBeInTheDocument();
    expect(within(dialog).getByText("Deselect All")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByText("Deselect All"));
    expect(onValuesChange).toHaveBeenLastCalledWith([]);
    expect(within(trigger).queryByText("3 selected")).not.toBeInTheDocument();
    expect(within(trigger).queryByText("ghost-user")).not.toBeInTheDocument();
    expect(customInput).toHaveValue("ghost-user");
    expect(within(dialog).getByText("Select All")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByText("Select All"));
    const secondSelectAllValues = onValuesChange.mock.lastCall?.[0] as string[];
    expect(new Set(secondSelectAllValues)).toEqual(
      new Set(firstSelectAllValues),
    );
    expect(within(trigger).getByText("3 selected")).toBeInTheDocument();
    expect(within(dialog).getByText("Deselect All")).toBeInTheDocument();
  });

  it("clears the custom input row once loaded options include a preselected value", () => {
    const onValueChange = vi.fn();
    const { rerender } = render(
      <MultiSelect
        values={["key-1"]}
        options={[]}
        onValueChange={onValueChange}
        isCustomSelectEnabled
      />,
    );

    rerender(
      <MultiSelect
        values={["key-1"]}
        options={[
          { value: "key-1", displayValue: "Primary key" },
          { value: "key-2", displayValue: "Secondary key" },
        ]}
        onValueChange={onValueChange}
        isCustomSelectEnabled
      />,
    );

    const trigger = screen.getByRole("button");
    fireEvent.click(trigger);

    const customInput = screen.getByPlaceholderText("Enter custom value");
    expect(within(trigger).getByText("Primary key")).toBeInTheDocument();
    expect(customInput).toHaveValue("");

    fireEvent.click(customInput.closest("[role='option']")!);
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("preserves pending custom text edits across intervening option clicks, Select All, and unmount", () => {
    vi.useFakeTimers();
    try {
      const onValuesChange = vi.fn();
      const { unmount } = render(
        <ControlledMultiSelect
          initialValues={["custom-old"]}
          options={[{ value: "user-1" }, { value: "user-2" }]}
          onValuesChange={onValuesChange}
        />,
      );

      fireEvent.click(screen.getByRole("button"));
      const dialog = screen.getByRole("dialog");
      const customInput = screen.getByPlaceholderText("Enter custom value");

      fireEvent.change(customInput, { target: { value: "custom-new" } });
      fireEvent.click(within(dialog).getByText("user-1"));

      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(new Set(onValuesChange.mock.lastCall?.[0] as string[])).toEqual(
        new Set(["user-1", "custom-new"]),
      );

      fireEvent.change(customInput, { target: { value: "custom-final" } });
      fireEvent.click(within(dialog).getByText("Select All"));
      expect(new Set(onValuesChange.mock.lastCall?.[0] as string[])).toEqual(
        new Set(["user-1", "user-2", "custom-final"]),
      );

      fireEvent.change(customInput, { target: { value: "custom-unmount" } });
      unmount();
      expect(new Set(onValuesChange.mock.lastCall?.[0] as string[])).toEqual(
        new Set(["user-1", "user-2", "custom-unmount"]),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
