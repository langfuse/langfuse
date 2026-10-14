import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SelectionProvider, useSelection } from "../contexts/SelectionContext";
import { TraceLayoutMobile } from "./TraceLayoutMobile";

const { query, setQuery } = vi.hoisted(() => ({
  query: new Map<string, string>(),
  setQuery: vi.fn(),
}));

vi.mock("use-query-params", () => ({
  StringParam: {},
  useQueryParam: (name: string) => [
    query.get(name),
    (value: string | null, updateType: string) =>
      setQuery(name, value, updateType),
  ],
}));
vi.mock("../contexts/ViewPreferencesContext", () => ({
  useViewPreferences: () => ({
    jsonViewPreference: "pretty",
    setJsonViewPreference: vi.fn(),
  }),
}));
vi.mock("./TraceTruncationNotice", () => ({
  TraceTruncationNotice: () => null,
}));

function Navigator() {
  const { selectedNodeId, selectNode } = useSelection();
  return (
    <button onClick={() => selectNode(selectedNodeId)}>
      Select observation
    </button>
  );
}

function Workspace({ rootId }: { rootId: string | null }) {
  return (
    <SelectionProvider
      defaultObservationId={rootId}
      isMobile
      expandDetailOnMount={false}
    >
      <TraceLayoutMobile
        tree={<Navigator />}
        timeline={null}
        graph={null}
        info={<p>Observation details</p>}
        showGraph={false}
      />
    </SelectionProvider>
  );
}

describe("Trace workspace selection and visibility", () => {
  beforeEach(() => {
    query.clear();
    vi.clearAllMocks();
  });

  it("keeps Tree active when the default root loads", () => {
    const { rerender } = render(<Workspace rootId={null} />);
    rerender(<Workspace rootId="root" />);
    expect(screen.getByRole("tab", { name: "Tree" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(setQuery).not.toHaveBeenCalled();
  });

  it("opens Data for a direct observation link", () => {
    query.set("observation", "child");
    render(<Workspace rootId="root" />);
    expect(screen.getByRole("tab", { name: "Data" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("lets a restored URL tab override the selected observation", () => {
    query.set("observation", "child");
    query.set("mobileTab", "tree");
    render(<Workspace rootId="root" />);
    expect(screen.getByRole("tab", { name: "Tree" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("selects the default root and opens Data in the same action", () => {
    render(<Workspace rootId="root" />);
    fireEvent.click(screen.getByRole("button", { name: "Select observation" }));
    expect(setQuery.mock.calls).toEqual([
      ["observation", "root", undefined],
      ["mobileTab", "info", "pushIn"],
    ]);
  });

  const renderDesktop = () =>
    renderHook(() => useSelection(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <SelectionProvider
          defaultObservationId="root"
          isMobile={false}
          expandDetailOnMount={false}
        >
          {children}
        </SelectionProvider>
      ),
    });

  it("keeps a collapsed desktop panel collapsed for the implicit root", () => {
    const { result } = renderDesktop();
    act(() => result.current.setDetailPanelCollapsed(true));
    expect(result.current.selectedNodeId).toBe("root");
    expect(result.current.detailPanelCollapsed).toBe(true);
    expect(result.current.pendingPanelExpand).toBeNull();
  });

  it("opens a collapsed desktop panel when its selected root is clicked again", () => {
    const { result } = renderDesktop();
    act(() => result.current.setDetailPanelCollapsed(true));
    act(() => result.current.selectNode("root"));
    expect(result.current.pendingPanelExpand).toBe("detail");
  });

  it("requests desktop details when opening an observation deep link", () => {
    query.set("observation", "child");
    const { result } = renderDesktop();
    expect(result.current.selectedNodeId).toBe("child");
    expect(result.current.pendingPanelExpand).toBe("detail");
  });

  it("reopens collapsed desktop details for Back and Forward selection changes", () => {
    query.set("observation", "a");
    const { result, rerender } = renderDesktop();
    act(() => result.current.setPendingPanelExpand(null));

    query.set("observation", "b");
    rerender();
    act(() => {
      result.current.setPendingPanelExpand(null);
      result.current.setDetailPanelCollapsed(true);
    });
    expect(result.current.pendingPanelExpand).toBeNull();

    query.set("observation", "a");
    rerender();
    expect(result.current.selectedNodeId).toBe("a");
    expect(result.current.pendingPanelExpand).toBe("detail");

    act(() => result.current.setPendingPanelExpand(null));
    query.set("observation", "b");
    rerender();
    expect(result.current.selectedNodeId).toBe("b");
    expect(result.current.pendingPanelExpand).toBe("detail");
  });

  it("reopens desktop details when history clears the explicit selection", () => {
    query.set("observation", "child");
    const { result, rerender } = renderDesktop();
    act(() => {
      result.current.setPendingPanelExpand(null);
      result.current.setDetailPanelCollapsed(true);
    });

    query.delete("observation");
    rerender();
    expect(result.current.selectedNodeId).toBe("root");
    expect(result.current.pendingPanelExpand).toBe("detail");
  });

  it("preserves the restored mobile tab when history changes selection", () => {
    query.set("observation", "a");
    query.set("mobileTab", "info");
    const { rerender } = render(<Workspace rootId="root" />);

    query.set("observation", "b");
    query.set("mobileTab", "tree");
    rerender(<Workspace rootId="root" />);
    expect(screen.getByRole("tab", { name: "Tree" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(setQuery).not.toHaveBeenCalled();
  });

  it("keeps desktop details collapsed when a synthetic graph node clears selection", () => {
    query.set("observation", "child");
    const { result, rerender } = renderDesktop();
    act(() => {
      result.current.setPendingPanelExpand(null);
      result.current.setDetailPanelCollapsed(true);
      result.current.setSelectedNodeId(null);
    });

    query.delete("observation");
    rerender();
    expect(result.current.selectedNodeId).toBe("root");
    expect(result.current.pendingPanelExpand).toBeNull();
  });
});
