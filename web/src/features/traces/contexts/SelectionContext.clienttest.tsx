import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SelectionProvider, useSelection } from "./SelectionContext";

const mockSetQueryParam = vi.hoisted(() => vi.fn());

vi.mock("use-query-params", () => ({
  StringParam: {},
  useQueryParam: () => [null, mockSetQueryParam],
}));

vi.mock("./ViewPreferencesContext", () => ({
  useViewPreferences: () => ({
    jsonViewPreference: "pretty",
    setJsonViewPreference: vi.fn(),
  }),
}));

vi.mock("@/src/hooks/useDebounce", () => ({
  useDebounce: (callback: (value: string) => void) => callback,
}));

function SelectionState() {
  const { collapsedNodes, toggleCollapsed, expandAll, collapseAll } =
    useSelection();

  return (
    <>
      <span>
        {collapsedNodes.has("trace-current")
          ? "current-collapsed"
          : "current-open"}
      </span>
      <span>
        {collapsedNodes.has("trace-sibling")
          ? "sibling-collapsed"
          : "sibling-open"}
      </span>
      <button onClick={() => toggleCollapsed("trace-sibling")}>
        Toggle sibling
      </button>
      <button onClick={expandAll}>Expand all</button>
      <button onClick={() => collapseAll(["trace-current", "trace-sibling"])}>
        Collapse all
      </button>
    </>
  );
}

function TestProvider({
  defaultCollapsedNodeIds,
}: {
  defaultCollapsedNodeIds: string[];
}) {
  return (
    <SelectionProvider {...{ defaultCollapsedNodeIds }}>
      <SelectionState />
    </SelectionProvider>
  );
}

describe("SelectionProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("collapses sibling traces when session data arrives and lets users expand them", () => {
    const { rerender } = render(<TestProvider defaultCollapsedNodeIds={[]} />);

    expect(screen.getByText("sibling-open")).toBeInTheDocument();

    rerender(<TestProvider defaultCollapsedNodeIds={["trace-sibling"]} />);

    expect(screen.getByText("current-open")).toBeInTheDocument();
    expect(screen.getByText("sibling-collapsed")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Toggle sibling" }));

    expect(screen.getByText("sibling-open")).toBeInTheDocument();
  });

  it("preserves expand-all and collapse-all behavior", () => {
    render(<TestProvider defaultCollapsedNodeIds={["trace-sibling"]} />);

    fireEvent.click(screen.getByRole("button", { name: "Expand all" }));

    expect(screen.getByText("current-open")).toBeInTheDocument();
    expect(screen.getByText("sibling-open")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));

    expect(screen.getByText("current-collapsed")).toBeInTheDocument();
    expect(screen.getByText("sibling-collapsed")).toBeInTheDocument();
  });
});
