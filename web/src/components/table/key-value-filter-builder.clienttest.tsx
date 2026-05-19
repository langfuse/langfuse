import { fireEvent, render, screen } from "@testing-library/react";
import { KeyValueFilterBuilder } from "./key-value-filter-builder";

const noop = () => {};

describe("KeyValueFilterBuilder", () => {
  beforeAll(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("shows selected keys in the combobox even when keyOptions omit them", () => {
    render(
      <KeyValueFilterBuilder
        mode="numeric"
        keyOptions={["known-key"]}
        activeFilters={[{ key: "missing-key", operator: "=", value: 1 }]}
        onChange={noop}
      />,
    );

    fireEvent.click(screen.getAllByRole("combobox")[0]);

    expect(screen.getAllByText("missing-key")).not.toHaveLength(0);
  });

  it("preserves incomplete local filters across equivalent parent rerenders", () => {
    const { rerender } = render(
      <KeyValueFilterBuilder
        mode="string"
        activeFilters={[]}
        onChange={noop}
      />,
    );

    fireEvent.click(screen.getByText("Add filter"));
    fireEvent.change(screen.getByPlaceholderText("Key"), {
      target: { value: "draft-key" },
    });
    fireEvent.change(screen.getByPlaceholderText("Value"), {
      target: { value: "draft-value" },
    });

    rerender(
      <KeyValueFilterBuilder
        mode="string"
        activeFilters={[]}
        onChange={noop}
      />,
    );

    expect(screen.getByDisplayValue("draft-value")).toBeInTheDocument();
  });
});
