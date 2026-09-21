import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import type { FilterState } from "@langfuse/shared";
import { applyKeyedFilterEntries } from "@/src/features/filters/lib/sidebar-filter-actions";
import { KeyValueFilterBuilder } from "./key-value-filter-builder";

const noop = () => {};

function MetadataBuilderHarness() {
  const [filters, setFilters] = useState<FilterState>([
    {
      column: "metadata",
      type: "stringObject",
      key: "region",
      operator: "=",
      value: "eu",
    },
    {
      column: "metadata",
      type: "stringObject",
      key: "team",
      operator: "=",
      value: "core",
    },
  ]);

  return (
    <>
      <KeyValueFilterBuilder
        mode="string"
        activeFilters={filters.flatMap((filter) =>
          filter.type === "stringObject" &&
          (filter.operator === "=" ||
            filter.operator === "contains" ||
            filter.operator === "does not contain")
            ? [
                {
                  key: filter.key,
                  operator: filter.operator,
                  value: filter.value,
                },
              ]
            : [],
        )}
        onChange={(entries) =>
          setFilters((current) =>
            applyKeyedFilterEntries(current, "metadata", {
              kind: "stringObject",
              entries,
            }),
          )
        }
      />
      <button
        onClick={() =>
          setFilters((current) =>
            current.filter(
              (filter) => !("key" in filter && filter.key === "region"),
            ),
          )
        }
      >
        Remove region externally
      </button>
      <button onClick={() => setFilters([])}>Clear externally</button>
      <output data-testid="applied-filters">{JSON.stringify(filters)}</output>
    </>
  );
}

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

  it("keeps a facet with nothing enumerated on free text while typing a key", () => {
    // A project with no scores offers no keys, so the pick-only combobox would
    // trap the user: it must not appear just because the row now holds a
    // half-typed key of its own.
    render(
      <KeyValueFilterBuilder
        mode="numeric"
        keyOptions={[]}
        activeFilters={[]}
        onChange={noop}
      />,
    );

    fireEvent.click(screen.getByText("Add filter"));
    const key = screen.getByPlaceholderText("Key");
    fireEvent.change(key, { target: { value: "a" } });
    fireEvent.change(key, { target: { value: "accuracy" } });

    expect(screen.getByPlaceholderText("Key")).toHaveValue("accuracy");
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

    rerender(
      <KeyValueFilterBuilder
        mode="string"
        activeFilters={[]}
        onChange={noop}
      />,
    );

    expect(screen.getByDisplayValue("draft-key")).toBeInTheDocument();
  });

  it("adopts external removals without reviving removed rows or losing incomplete edits", () => {
    render(<MetadataBuilderHarness />);
    fireEvent.click(screen.getByText("Add filter"));
    fireEvent.change(screen.getAllByPlaceholderText("Key")[2], {
      target: { value: "draft-key" },
    });

    fireEvent.click(screen.getByText("Remove region externally"));
    expect(screen.queryByDisplayValue("region")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("draft-key")).toBeInTheDocument();

    const value = screen.getByDisplayValue("core");
    value.focus();
    fireEvent.change(value, { target: { value: "" } });
    expect(screen.getByDisplayValue("team")).toBeInTheDocument();
    expect(value).toHaveFocus();
    fireEvent.change(value, { target: { value: "platform" } });
    expect(value).toHaveFocus();
    expect(
      JSON.parse(screen.getByTestId("applied-filters").textContent!),
    ).toEqual([
      {
        column: "metadata",
        type: "stringObject",
        key: "team",
        operator: "=",
        value: "platform",
      },
    ]);

    fireEvent.click(screen.getByText("Clear externally"));
    expect(screen.queryByDisplayValue("team")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("draft-key")).toBeInTheDocument();
  });
});
