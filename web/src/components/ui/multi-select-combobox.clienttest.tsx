import { fireEvent, render, screen } from "@testing-library/react";
import { MultiSelectCombobox } from "./multi-select-combobox";

describe("MultiSelectCombobox", () => {
  it("keeps fixed controls outside the single-line scrolling area", () => {
    const { container } = render(
      <MultiSelectCombobox
        selectedItems={[{ id: "experiment-1", name: "Experiment 1" }]}
        onItemsChange={vi.fn()}
        searchQuery=""
        onSearchChange={vi.fn()}
        searchResults={[]}
        renderItem={() => null}
        renderSelectedItem={(item) => <span>{item.name}</span>}
        getItemKey={(item) => item.id}
        singleLine
      />,
    );

    const input = screen.getByRole("textbox");
    const scrollingArea = input.parentElement;

    expect(scrollingArea).toHaveClass("overflow-x-auto");
    expect(scrollingArea?.querySelector("svg")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("opens the dropdown without adding it to the layout flow", () => {
    const { container } = render(
      <MultiSelectCombobox
        selectedItems={[]}
        onItemsChange={vi.fn()}
        searchQuery=""
        onSearchChange={vi.fn()}
        searchResults={[{ id: "experiment-1", name: "Experiment 1" }]}
        renderItem={(item) => <div>{item.name}</div>}
        renderSelectedItem={(item) => <span>{item.name}</span>}
        getItemKey={(item) => item.id}
      />,
    );

    fireEvent.focus(screen.getByRole("textbox"));

    expect(container.firstElementChild).toHaveClass("relative");
    expect(screen.getByText("Experiment 1").closest(".absolute")).toHaveClass(
      "absolute",
      "top-full",
    );
  });
});
