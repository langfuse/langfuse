import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { type ComponentProps } from "react";
import { type ElkGraphRenderer } from "./ElkGraphRenderer";
import { TraceGraphView } from "./TraceGraphView";
import { LANGFUSE_START_NODE_NAME } from "../types";

vi.mock("../buildGraphCanvasData", () => ({
  transformLanggraphToGeneralized: (data: unknown) => data,
  buildGraphFromStepData: () => ({
    graph: {
      nodes: [
        { id: "root-node", label: "Root", type: "SPAN" },
        { id: "child-node", label: "Child", type: "SPAN" },
        { id: "__start__", label: "Start", type: "SPAN" },
      ],
      edges: [],
    },
    nodeToObservationsMap: {
      "root-node": ["root"],
      "child-node": ["child"],
    },
  }),
}));

vi.mock("./ElkGraphRenderer", () => ({
  ElkGraphRenderer: ({
    selectedNodeName,
    onCanvasNodeNameChange,
  }: Pick<
    ComponentProps<typeof ElkGraphRenderer>,
    "selectedNodeName" | "onCanvasNodeNameChange"
  >) => (
    <>
      <output data-testid="selection">{selectedNodeName}</output>
      <button onClick={() => onCanvasNodeNameChange("__start__")}>
        Select start
      </button>
    </>
  ),
}));

describe("TraceGraphView selection echoes", () => {
  it("preserves a synthetic highlight when clearing selection resolves to the root", () => {
    const onSelectedObservationChange = vi.fn();
    const props = {
      agentGraphData: [],
      defaultObservationId: "root",
      onSelectedObservationChange,
    };
    const { rerender } = render(
      <TraceGraphView {...props} selectedObservationId="child" />,
    );
    expect(screen.getByTestId("selection")).toHaveTextContent("child-node");

    fireEvent.click(screen.getByRole("button", { name: "Select start" }));
    expect(onSelectedObservationChange).toHaveBeenCalledWith(null);
    rerender(<TraceGraphView {...props} selectedObservationId="root" />);
    expect(screen.getByTestId("selection")).toHaveTextContent(
      LANGFUSE_START_NODE_NAME,
    );

    rerender(<TraceGraphView {...props} selectedObservationId="child" />);
    expect(screen.getByTestId("selection")).toHaveTextContent("child-node");
  });

  it("does not swallow a later selection after clearing an already implicit root", () => {
    const props = {
      agentGraphData: [],
      defaultObservationId: "root",
      onSelectedObservationChange: vi.fn(),
    };
    const { rerender } = render(
      <TraceGraphView {...props} selectedObservationId="root" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Select start" }));
    rerender(<TraceGraphView {...props} selectedObservationId="child" />);
    expect(screen.getByTestId("selection")).toHaveTextContent("child-node");
  });
});
