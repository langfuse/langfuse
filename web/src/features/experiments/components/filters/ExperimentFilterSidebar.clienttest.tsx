import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { type FilterState } from "@langfuse/shared";
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
  scores_avg: ["private-quality"],
  score_categories: { "private-rating": ["good"] },
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

  it("adds a complete all-experiments score condition from an empty sidebar and captures metadata only", () => {
    render(<Harness initialFilters={[]} />);
    expect(screen.getByText("No active filters.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add filter" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Filter to add" }), {
      target: { value: "scores_avg" },
    });
    expect(
      (
        screen.getByRole("combobox", {
          name: "Filter experiment",
        }) as HTMLSelectElement
      ).value,
    ).toBe("all");
    fireEvent.change(screen.getByRole("combobox", { name: "Score name" }), {
      target: { value: "private-quality" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Filter value" }), {
      target: { value: "0.7" },
    });
    expect(changed).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Add condition" }));
    expect(changed).toHaveBeenLastCalledWith([
      { ...numeric("all"), operator: "=", value: 0.7 },
    ]);
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
    expect(JSON.stringify(capture.mock.calls)).not.toContain("0.7");
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
