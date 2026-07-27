import { fireEvent, render, screen, within } from "@testing-library/react";
import type { FilterOption } from "@langfuse/shared";
import { MultiSelect } from "./multi-select";

// Radix Popover + cmdk rely on browser APIs jsdom does not implement.
beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;

  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

/**
 * Renders the dropdown and returns the open popover listbox.
 *
 * Traces without a name are stored as an empty string in ClickHouse, so the
 * filter-options endpoint legitimately returns `{ value: "", count: n }`.
 */
const openDropdown = (options: FilterOption[], values: string[] = []) => {
  const onValueChange = vi.fn();
  render(
    <MultiSelect
      title="Value"
      values={values}
      onValueChange={onValueChange}
      options={options}
      allowEmptyOption
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /select/i }));
  return { onValueChange };
};

const TRACE_NAME_OPTIONS: FilterOption[] = [
  { value: "chat-completion", count: 12 },
  { value: "", count: 3 },
];

describe("MultiSelect empty-string option (langfuse#1198)", () => {
  it("offers the empty-string option as '(empty)' so nameless traces are filterable", () => {
    openDropdown(TRACE_NAME_OPTIONS);

    expect(screen.getByText("(empty)")).toBeInTheDocument();
  });

  it("emits the empty string as the filter value when '(empty)' is selected", () => {
    const { onValueChange } = openDropdown(TRACE_NAME_OPTIONS);

    fireEvent.click(screen.getByText("(empty)"));

    expect(onValueChange).toHaveBeenCalledWith([""]);
  });

  it("shows the option's trace count alongside '(empty)'", () => {
    openDropdown(TRACE_NAME_OPTIONS);

    const emptyOption = screen.getByText("(empty)").closest("[cmdk-item]");
    expect(emptyOption).not.toBeNull();
    expect(
      within(emptyOption as HTMLElement).getByText("3"),
    ).toBeInTheDocument();
  });

  it("includes the empty option in 'Select All'", () => {
    const { onValueChange } = openDropdown(TRACE_NAME_OPTIONS);

    fireEvent.click(screen.getByText("Select All"));

    expect(onValueChange).toHaveBeenCalledWith(
      expect.arrayContaining(["chat-completion", ""]),
    );
  });

  it("deselects the empty option when it is already selected", () => {
    const { onValueChange } = openDropdown(TRACE_NAME_OPTIONS, [""]);

    // "(empty)" also renders as the trigger badge, so scope to the list item.
    const emptyOption = screen
      .getAllByText("(empty)")
      .map((el) => el.closest("[cmdk-item]"))
      .find((el): el is HTMLElement => el !== null);
    expect(emptyOption).toBeDefined();
    fireEvent.click(emptyOption as HTMLElement);

    expect(onValueChange).toHaveBeenCalledWith([]);
  });

  it("labels the selected empty value as '(empty)' on the trigger badge", () => {
    openDropdown(TRACE_NAME_OPTIONS, [""]);

    const badge = screen
      .getAllByText("(empty)")
      .find((el) => el.closest("[cmdk-item]") === null);
    expect(badge).toBeDefined();
  });

  it("treats an already-selected empty value as fully selected for 'Select All'", () => {
    const { onValueChange } = openDropdown(TRACE_NAME_OPTIONS, [
      "chat-completion",
      "",
    ]);

    // Everything is selected, so the control must offer the inverse action.
    fireEvent.click(screen.getByText("Deselect All"));

    expect(onValueChange).toHaveBeenCalledWith([]);
  });

  it("keeps a selected '(empty)' when a custom value is added alongside it", () => {
    // traceName enables custom select, so the free-text row is rendered.
    const onValueChange = vi.fn();
    render(
      <MultiSelect
        title="Value"
        values={[""]}
        onValueChange={onValueChange}
        options={TRACE_NAME_OPTIONS}
        isCustomSelectEnabled
        allowEmptyOption
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /select/i }));

    const freeTextBox = screen.getByPlaceholderText("Enter custom value");
    fireEvent.change(freeTextBox, { target: { value: "my-custom-name" } });
    fireEvent.click(freeTextBox.closest("[cmdk-item]") as HTMLElement);

    expect(onValueChange).toHaveBeenCalledWith(
      expect.arrayContaining(["", "my-custom-name"]),
    );
  });

  it("clears the filter when the custom box is emptied, even though '' is an option", () => {
    // Regression: "" is a valid option here, so the old empty-stripping guard
    // no longer fired and clearing the box silently became an "is empty" filter.
    vi.useFakeTimers();
    try {
      const onValueChange = vi.fn();
      render(
        <MultiSelect
          title="Value"
          values={["typed-value"]}
          onValueChange={onValueChange}
          options={TRACE_NAME_OPTIONS}
          isCustomSelectEnabled
          allowEmptyOption
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: /select/i }));

      const freeTextBox = screen.getByPlaceholderText("Enter custom value");
      fireEvent.change(freeTextBox, { target: { value: "" } });
      vi.advanceTimersByTime(600);

      expect(onValueChange).toHaveBeenCalledWith([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not add '' when the free-text row is activated with an empty box", () => {
    // Regression: the else-branch added freeText ("") as a filter value and a
    // second activation re-added it instead of toggling it off.
    const onValueChange = vi.fn();
    render(
      <MultiSelect
        title="Value"
        values={[]}
        onValueChange={onValueChange}
        options={TRACE_NAME_OPTIONS}
        isCustomSelectEnabled
        allowEmptyOption
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /select/i }));

    fireEvent.click(
      screen
        .getByPlaceholderText("Enter custom value")
        .closest("[cmdk-item]") as HTMLElement,
    );

    expect(onValueChange).toHaveBeenCalledWith([]);
  });

  it("still discards the empty free-text value when '' is not a real option", () => {
    const onValueChange = vi.fn();
    render(
      <MultiSelect
        title="Value"
        values={[]}
        onValueChange={onValueChange}
        options={[{ value: "chat-completion", count: 12 }]}
        isCustomSelectEnabled
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /select/i }));

    // Selecting the free-text row with an empty box must not add "".
    const freeTextRow = screen
      .getByPlaceholderText("Enter custom value")
      .closest("[cmdk-item]") as HTMLElement;
    fireEvent.click(freeTextRow);

    expect(onValueChange).toHaveBeenCalledWith([]);
  });

  it("does not mark the free-text row as active when only '(empty)' is selected", () => {
    // The empty option is not a typed custom value, so the free-text row must
    // not render as checked above an empty input.
    render(
      <MultiSelect
        title="Value"
        values={[""]}
        onValueChange={vi.fn()}
        options={TRACE_NAME_OPTIONS}
        isCustomSelectEnabled
        allowEmptyOption
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /select/i }));

    const freeTextRow = screen
      .getByPlaceholderText("Enter custom value")
      .closest("[cmdk-item]") as HTMLElement;
    const checkbox = freeTextRow.querySelector("div");
    expect(checkbox?.className).toContain("invisible");
  });

  it("keeps '(empty)' selected when options have not loaded yet", () => {
    // While the filter-options query is in flight `options` is empty, so a
    // selected "" must not be mistaken for a custom free-text value.
    const onValueChange = vi.fn();
    render(
      <MultiSelect
        title="Value"
        values={[""]}
        onValueChange={onValueChange}
        options={[]}
        isCustomSelectEnabled
        allowEmptyOption
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /select/i }));

    fireEvent.click(
      screen
        .getByPlaceholderText("Enter custom value")
        .closest("[cmdk-item]") as HTMLElement,
    );

    // Nothing was typed, so the selection must be left untouched.
    expect(onValueChange).not.toHaveBeenCalledWith([]);
  });

  it("still renders ordinary options unchanged", () => {
    const { onValueChange } = openDropdown(TRACE_NAME_OPTIONS);

    fireEvent.click(screen.getByText("chat-completion"));

    expect(onValueChange).toHaveBeenCalledWith(["chat-completion"]);
  });

  it("does not invent an '(empty)' entry when no empty option exists", () => {
    openDropdown([{ value: "chat-completion", count: 12 }]);

    expect(screen.queryByText("(empty)")).not.toBeInTheDocument();
  });

  describe("without allowEmptyOption (arrayOptions/categoryOptions selectors)", () => {
    // "" is not a meaningful member of a tag array — an arrayOptions filter
    // containing "" resolves to hasAll(tags, [""]) and matches nothing — so
    // these selectors must keep hiding it, including from "Select All".
    const renderDefault = (values: string[] = []) => {
      const onValueChange = vi.fn();
      render(
        <MultiSelect
          title="Value"
          values={values}
          onValueChange={onValueChange}
          options={[
            { value: "production", count: 4 },
            { value: "", count: 2 },
          ]}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: /select/i }));
      return { onValueChange };
    };

    it("hides the empty option by default", () => {
      renderDefault();

      expect(screen.queryByText("(empty)")).not.toBeInTheDocument();
    });

    it("does not sweep the empty value into 'Select All'", () => {
      const { onValueChange } = renderDefault();

      fireEvent.click(screen.getByText("Select All"));

      expect(onValueChange).toHaveBeenCalledWith(["production"]);
    });
  });
});
