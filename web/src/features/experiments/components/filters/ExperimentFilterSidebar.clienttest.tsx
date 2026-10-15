import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { type FilterState } from "@langfuse/shared";
import { LayerProvider } from "@/src/context/LayerContext/LayerContext";
import { Sheet, SheetContent, SheetTitle } from "@/src/components/ui/sheet";
import { ExperimentFilterSidebar } from "./ExperimentFilterSidebar";

const { capture, changed } = vi.hoisted(() => ({
  capture: vi.fn(),
  changed: vi.fn(),
}));
vi.mock("@/src/features/posthog-analytics", () => ({
  usePostHogClientCapture: () => capture,
}));
vi.mock("@/src/components/table/data-table-controls", () => ({
  useDataTableControls: () => ({
    open: true,
    setOpen: vi.fn(),
    isMobile: false,
  }),
}));
vi.mock("@/src/components/design-system/SelectInput/SelectInput", () => ({
  SelectInput: ({
    value,
    options,
    onValueChange,
    placeholder,
    ...props
  }: {
    value: string;
    options: { value: string; label: string }[];
    onValueChange: (value: string) => void;
    placeholder: string;
    "aria-label": string;
  }) => (
    <select
      aria-label={props["aria-label"]}
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));
vi.mock("@/src/components/score-tag", () => ({
  ScoreTag: ({ level }: { level: string }) => <span>{level}</span>,
}));

const targets = [
  { id: "all", label: "All selected experiments" },
  { id: "baseline", label: "Baseline" },
  { id: "run-a", label: "Run A" },
  { id: "run-b", label: "Run B" },
];
const options = {
  scores_avg: ["private-passed", "private-rating", "private-quality"],
  score_categories: { "private-rating": ["good"] },
  score_booleans: ["private-passed"],
  level: ["DEFAULT", "ERROR"],
};
const optionsByTarget = Object.fromEntries(
  targets.map((target) => [target.id, options]),
);
const numeric = (target: string): FilterState[number] => ({
  column: "scores_avg",
  type: "numberObject",
  key: "private-quality",
  operator: ">",
  value: 0.8,
  target,
});

function Harness({ initialFilters }: { initialFilters: FilterState }) {
  const [filters, setFilters] = useState(initialFilters);
  return (
    <ExperimentFilterSidebar
      filters={filters}
      onChange={(next) => {
        setFilters(next);
        changed(next);
      }}
      onClearAll={() => {
        setFilters([]);
        changed([]);
      }}
      targets={targets}
      optionsByTarget={optionsByTarget}
    />
  );
}

describe("experiment filter sidebar", () => {
  beforeEach(() => vi.clearAllMocks());

  it("opens a type picker and immediately applies the displayed score default without a draft card", () => {
    render(<Harness initialFilters={[]} />);
    expect(screen.getByText("No active filters.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add filter" }));
    const picker = screen.getByRole("dialog");
    expect(within(picker).getByText("private-quality >= 0")).toBeTruthy();
    expect(screen.queryByRole("form")).toBeNull();
    expect(changed).not.toHaveBeenCalled();
    fireEvent.click(
      within(picker).getByRole("button", { name: /Numeric score/ }),
    );
    expect(
      (
        screen.getByRole("combobox", {
          name: "Filter experiment",
        }) as HTMLSelectElement
      ).value,
    ).toBe("all");
    expect(changed).toHaveBeenLastCalledWith([
      { ...numeric("all"), operator: ">=", value: 0 },
    ]);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: "Add condition" })).toBeNull();
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith(
      "filters:applied",
      expect.objectContaining({
        tableName: "experiment-items",
        isV4: true,
        targetKind: "all",
      }),
    );
    expect(JSON.stringify(capture.mock.calls)).not.toContain("private-quality");
  });

  it("retargets and removes one of two identical score predicates without changing the other", () => {
    const metadata: FilterState[number] = {
      column: "itemMetadata",
      type: "stringObject",
      key: "private-region",
      operator: "is set",
      value: "",
      target: "baseline",
    };
    render(
      <Harness
        initialFilters={[numeric("run-a"), numeric("run-b"), metadata]}
      />,
    );
    const first = screen.getAllByRole("form", {
      name: "Numeric score filter",
    })[0];
    fireEvent.change(
      within(first).getByRole("combobox", { name: "Filter experiment" }),
      { target: { value: "baseline" } },
    );
    fireEvent.click(
      within(first).getByRole("button", { name: "Apply changes" }),
    );
    expect(changed).toHaveBeenLastCalledWith([
      numeric("baseline"),
      numeric("run-b"),
      metadata,
    ]);
    const second = screen.getAllByRole("form", {
      name: "Numeric score filter",
    })[1];
    fireEvent.click(
      within(second).getByRole("button", {
        name: "Remove Numeric score filter",
      }),
    );
    expect(changed).toHaveBeenLastCalledWith([numeric("baseline"), metadata]);
    expect(capture).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(capture.mock.calls)).not.toContain("run-a");
    expect(JSON.stringify(capture.mock.calls)).not.toContain("run-b");
  });

  it.each([
    {
      label: "Status",
      expected: {
        column: "level",
        type: "stringOptions",
        operator: "any of",
        value: ["DEFAULT"],
        target: "all",
      },
    },
    {
      label: "Categorical score",
      expected: {
        column: "score_categories",
        type: "categoryOptions",
        key: "private-rating",
        operator: "any of",
        value: ["good"],
        target: "all",
      },
    },
    {
      label: "Boolean score",
      expected: {
        column: "score_booleans",
        type: "booleanObject",
        key: "private-passed",
        operator: "=",
        value: true,
        target: "all",
      },
    },
  ])(
    "applies a valid $label default directly from the picker",
    ({ label, expected }) => {
      render(
        <ExperimentFilterSidebar
          filters={[]}
          onChange={changed}
          onClearAll={vi.fn()}
          targets={targets}
          optionsByTarget={optionsByTarget}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "Add filter" }));
      fireEvent.click(
        within(screen.getByRole("dialog")).getByRole("button", {
          name: new RegExp(label),
        }),
      );
      expect(changed).toHaveBeenCalledExactlyOnceWith([expected]);
      expect(screen.queryByRole("dialog")).toBeNull();
    },
  );

  it("keeps metadata setup inside the popup and discards cancellation before adding a complete presence filter", () => {
    render(<Harness initialFilters={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Add filter" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: /^Item metadata/,
      }),
    );
    const dialog = screen.getByRole("dialog");
    expect(
      (
        within(dialog).getByRole("button", {
          name: "Add filter",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.submit(within(dialog).getByRole("form"));
    fireEvent.change(
      within(dialog).getByRole("textbox", { name: "Metadata key" }),
      { target: { value: "discarded" } },
    );
    expect(
      within(screen.getByRole("complementary")).queryByRole("form"),
    ).toBeNull();
    expect(changed).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(capture).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Add filter" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: /^Item metadata/,
      }),
    );
    const nextDialog = screen.getByRole("dialog");
    expect(
      (
        within(nextDialog).getByRole("textbox", {
          name: "Metadata key",
        }) as HTMLInputElement
      ).value,
    ).toBe("");
    fireEvent.change(
      within(nextDialog).getByRole("textbox", { name: "Metadata key" }),
      { target: { value: " private key " } },
    );
    fireEvent.click(
      within(nextDialog).getByRole("button", { name: "Add filter" }),
    );
    expect(changed).toHaveBeenCalledExactlyOnceWith([
      {
        column: "itemMetadata",
        type: "stringObject",
        key: " private key ",
        operator: "is set",
        value: "",
        target: "all",
      },
    ]);
    expect(
      screen.getByRole("form", { name: "Item metadata filter" }),
    ).toBeTruthy();
    expect(capture).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(capture.mock.calls)).not.toContain("private key");
  });

  it("disables unavailable score defaults until options contain an observed score", () => {
    const props = {
      filters: [],
      onChange: changed,
      onClearAll: vi.fn(),
      targets,
    };
    const { rerender } = render(
      <ExperimentFilterSidebar
        {...props}
        optionsByTarget={{ all: undefined }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add filter" }));
    const numericChoice = () =>
      within(screen.getByRole("dialog")).getByRole("button", {
        name: /Numeric score/,
      }) as HTMLButtonElement;
    expect(numericChoice().disabled).toBe(true);
    expect(numericChoice().textContent).toContain("Loading scores");
    rerender(
      <ExperimentFilterSidebar {...props} optionsByTarget={{ all: {} }} />,
    );
    expect(numericChoice().disabled).toBe(true);
    expect(numericChoice().textContent).toContain("No scores of this type");
    fireEvent.click(numericChoice());
    expect(changed).not.toHaveBeenCalled();
    rerender(
      <ExperimentFilterSidebar {...props} optionsByTarget={optionsByTarget} />,
    );
    expect(numericChoice().disabled).toBe(false);
    fireEvent.click(numericChoice());
    expect(changed).toHaveBeenCalledExactlyOnceWith([
      { ...numeric("all"), operator: ">=", value: 0 },
    ]);
  });

  it("shows an addable catalog when active-only is unchecked without creating pending cards", () => {
    render(<Harness initialFilters={[]} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Show only active" }));
    expect(screen.getByText("Available filters")).toBeTruthy();
    expect(screen.queryByRole("form")).toBeNull();
    expect(changed).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Numeric score/ }));
    expect(changed).toHaveBeenLastCalledWith([
      { ...numeric("all"), operator: ">=", value: 0 },
    ]);
    fireEvent.click(screen.getByRole("button", { name: /^Metadata/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(
      within(dialog).getByRole("textbox", { name: "Metadata key" }),
      { target: { value: "private-field" } },
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Add filter" }));
    expect(changed).toHaveBeenLastCalledWith([
      { ...numeric("all"), operator: ">=", value: 0 },
      {
        column: "eventMetadata",
        type: "stringObject",
        key: "private-field",
        operator: "is set",
        value: "",
        target: "all",
      },
    ]);
  });

  it("keeps creation choices accessible and actionable inside the mobile modal sheet", () => {
    render(
      <LayerProvider>
        <Sheet open>
          <SheetContent side="bottom" aria-describedby={undefined}>
            <SheetTitle>Filters</SheetTitle>
            <ExperimentFilterSidebar
              layout="inline"
              filters={[]}
              onChange={changed}
              onClearAll={vi.fn()}
              targets={targets}
              optionsByTarget={optionsByTarget}
            />
          </SheetContent>
        </Sheet>
      </LayerProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add filter" }));
    fireEvent.click(screen.getByRole("button", { name: /^Boolean score/ }));
    expect(changed).toHaveBeenCalledExactlyOnceWith([
      {
        column: "score_booleans",
        type: "booleanObject",
        key: "private-passed",
        operator: "=",
        value: true,
        target: "all",
      },
    ]);
  });

  it("keeps the applied condition when another experiment records the same score name as a different type", () => {
    render(
      <ExperimentFilterSidebar
        filters={[numeric("run-a")]}
        onChange={changed}
        onClearAll={vi.fn()}
        targets={targets}
        optionsByTarget={{
          ...optionsByTarget,
          "run-b": { score_categories: { "private-quality": ["good"] } },
        }}
      />,
    );
    fireEvent.change(
      screen.getByRole("combobox", { name: "Filter experiment" }),
      {
        target: { value: "run-b" },
      },
    );
    expect(screen.getByRole("alert").textContent).toContain("different type");
    expect(
      (
        screen.getByRole("button", {
          name: "Apply changes",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(changed).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
  });

  it("waits for the selected experiment's score options before applying a retargeted condition", () => {
    const props = {
      filters: [numeric("run-a")],
      onChange: changed,
      onClearAll: vi.fn(),
      targets,
    };
    const { rerender } = render(
      <ExperimentFilterSidebar
        {...props}
        optionsByTarget={{ ...optionsByTarget, "run-b": undefined }}
      />,
    );
    fireEvent.change(
      screen.getByRole("combobox", { name: "Filter experiment" }),
      { target: { value: "run-b" } },
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Apply changes",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(screen.getByRole("status").textContent).toContain("score options");
    fireEvent.submit(
      screen.getByRole("form", { name: "Numeric score filter" }),
    );
    expect(changed).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();

    rerender(
      <ExperimentFilterSidebar {...props} optionsByTarget={optionsByTarget} />,
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Apply changes",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Apply changes" }));
    expect(changed).toHaveBeenLastCalledWith([numeric("run-b")]);
  });
});
