import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState, type ComponentProps } from "react";
import {
  notebookLayoutSchema,
  storedNotebookBlockSchema,
} from "@/src/features/notebooks/schema";
import { NotebookChart } from "../NotebookChart/NotebookChart";
import { promptExperiments } from "@/.storybook/fixtures/notebooks/promptExperiments";
import { supportDashboard } from "@/.storybook/fixtures/notebooks/supportDashboard";
import { NotebookReader } from "./NotebookReader";

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it("opens a document in a peek while keeping the notebook table visible", () => {
  const snapshot = promptExperiments.publications[0].documents;
  const layout = notebookLayoutSchema.parse({
    kind: "table",
    documents: snapshot.map(({ id, title, properties }) => ({
      documentId: id,
      title,
      properties,
    })),
    propertySchema: promptExperiments.propertySchema,
  });
  function Reader() {
    const [selected, setSelected] = useState<string | null>(null);
    const document = snapshot.find(({ id }) => id === selected) ?? snapshot[0];
    return (
      <NotebookReader
        view={{
          layout,
          documentId: document.id,
          documents: snapshot.map(({ id }) => ({ id, url: null })),
          blocks: document.blocks,
          version: 1,
          width: "contained",
        }}
        tableDocumentOpen={selected !== null}
        isLoadingDocument={false}
        onDocumentChange={setSelected}
        renderChart={() => null}
      />
    );
  }
  render(<Reader />);
  expect(screen.getByText("Pass rate (%)")).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "Sort by Pass rate (%)" }),
  );
  const row = screen.getByRole("row", { name: "Extra retrieval context" });
  expect(screen.getAllByRole("row")[1]).toBe(row);
  fireEvent.click(row);
  const peek = screen.getByRole("dialog", { name: "Document preview" });
  expect(
    within(peek).getByRole("heading", { name: "Extra retrieval context" }),
  ).toBeInTheDocument();
  expect(row).toHaveAttribute("aria-selected", "true");
  expect(screen.getByText("Pass rate (%)")).toBeInTheDocument();
  const resizeHandle = within(peek).getByRole("separator", {
    name: "Resize peek view",
  });
  const initialWidth = Number(resizeHandle.getAttribute("aria-valuenow"));
  fireEvent.keyDown(resizeHandle, { key: "ArrowRight" });
  const resizedWidth = Number(resizeHandle.getAttribute("aria-valuenow"));
  expect(resizedWidth).toBeLessThan(initialWidth);
  fireEvent.click(within(peek).getByRole("button", { name: "Close" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(row).toHaveAttribute("aria-selected", "false");
  expect(screen.getAllByRole("row")[1]).toBe(row);
  fireEvent.click(screen.getByRole("row", { name: "Baseline" }));
  expect(
    screen.getByRole("separator", { name: "Resize peek view" }),
  ).toHaveAttribute("aria-valuenow", String(resizedWidth));
});

it("renders a scalar metric and distinguishes zero from missing data", () => {
  const row = supportDashboard.publications[0].documents[0].blocks.find(
    (block) => block.id === "weekly-kpis",
  );
  expect(row?.schema).toBe("row@1");
  if (row?.schema !== "row@1") throw new Error("Missing KPI row");
  const block = storedNotebookBlockSchema.parse(row.props.children[0]);
  if (block.schema !== "chart@1") throw new Error("Missing KPI chart");
  expect(
    storedNotebookBlockSchema.safeParse({
      ...block,
      props: {
        ...block.props,
        query: { ...block.props.query, timeDimension: { granularity: "day" } },
      },
    }).success,
  ).toBe(false);
  const { rerender } = render(
    <NotebookChart
      block={block}
      state={{ type: "ready", rows: [{ count_count: "0" }] }}
    />,
  );
  expect(screen.getByText("0")).toBeInTheDocument();
  rerender(<NotebookChart block={block} state={{ type: "ready", rows: [] }} />);
  expect(screen.queryByText("0")).not.toBeInTheDocument();
  expect(screen.getByText(/no data/i)).toBeInTheDocument();
});

it("shows only the configured inbox properties without a visibility menu", () => {
  const onDocumentChange = vi.fn();
  render(
    <NotebookReader
      view={{
        layout: {
          kind: "inbox",
          propertySchema: {
            version: 1,
            fields: [
              { id: "priority", label: "Priority", type: "number" },
              { id: "status", label: "Status", type: "text" },
            ],
            visibleByDefault: ["priority"],
          },
          documents: [
            {
              documentId: "main",
              title: "Overview",
              properties: { priority: 0, status: "Open" },
            },
            { documentId: "missing", label: "Unprioritized" },
            {
              documentId: "urgent",
              label: "Urgent",
              properties: { priority: 10 },
            },
          ],
        },
        documentId: "main",
        documents: ["main", "missing", "urgent"].map((id) => ({
          id,
          url: null,
        })),
        blocks: [],
        version: null,
        width: "contained",
      }}
      isLoadingDocument={false}
      onDocumentChange={onDocumentChange}
      renderChart={() => null}
    />,
  );
  expect(
    screen.getByRole("button", { name: "Overview Priority: 0" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Overview" })).toBeInTheDocument();
  expect(screen.getByText("Status:")).toBeInTheDocument();
  expect(screen.getByText("Open")).toBeInTheDocument();
  expect(
    within(screen.getByRole("list")).queryByText("Open"),
  ).not.toBeInTheDocument();
  expect(screen.queryByText("Visible properties")).not.toBeInTheDocument();
  const sort = screen.getByRole("button", { name: "Sort documents" });
  const sortBy = (name: string) => {
    fireEvent.click(sort);
    fireEvent.click(screen.getByRole("menuitem", { name }));
  };
  const rows = () =>
    within(screen.getByRole("list"))
      .getAllByRole("button")
      .map((button) => button.textContent);
  sortBy("Priority descending");
  expect(rows()).toEqual([
    "UrgentPriority: 10",
    "OverviewPriority: 0",
    "Unprioritized",
  ]);
  sortBy("Priority ascending");
  expect(rows()).toEqual([
    "OverviewPriority: 0",
    "UrgentPriority: 10",
    "Unprioritized",
  ]);
  sortBy("Original order");
  expect(rows()).toEqual([
    "OverviewPriority: 0",
    "Unprioritized",
    "UrgentPriority: 10",
  ]);
  expect(screen.getByRole("button", { current: true })).toHaveAccessibleName(
    "Overview Priority: 0",
  );
  expect(onDocumentChange).not.toHaveBeenCalled();
});

it.each(["default", "inbox", "tabs"] as const)(
  "uses %s document navigation",
  (kind) => {
    const onDocumentChange = vi.fn();
    const documents = [
      { id: "main", url: null },
      { id: "detail", url: null },
    ];
    const layout: ComponentProps<typeof NotebookReader>["view"]["layout"] =
      kind === "default"
        ? { kind }
        : {
            kind,
            documents: [
              { documentId: "main", label: "Overview" },
              { documentId: "detail", label: "Details" },
            ],
          };
    function Reader() {
      const [documentId, setDocumentId] = useState("main");
      return (
        <NotebookReader
          view={{
            layout,
            documentId,
            documents,
            blocks: [],
            version: null,
            width: documentId === "main" ? "contained" : "full",
          }}
          isLoadingDocument={false}
          onDocumentChange={(id, version) => {
            onDocumentChange(id, version);
            if (id !== null) setDocumentId(id);
          }}
          renderChart={() => null}
        />
      );
    }

    render(<Reader />);
    const body = screen.getByText("This document is empty.");
    expect(body.parentElement).toHaveClass("max-w-4xl", "px-4", "sm:px-6");
    if (kind === "default") {
      expect(screen.queryByText("Details")).not.toBeInTheDocument();
      return;
    }
    const entry = screen.getByRole(kind === "tabs" ? "tab" : "button", {
      name: "Details",
    });
    if (kind === "tabs") {
      fireEvent.keyDown(entry, { key: "Enter" });
    } else {
      fireEvent.click(entry);
    }
    expect(onDocumentChange).toHaveBeenCalledWith("detail", null);
    const fullBody = screen.getByText("This document is empty.");
    expect(fullBody.parentElement).toHaveClass("max-w-none", "px-4", "sm:px-6");
    expect(fullBody.parentElement).not.toHaveClass("max-w-4xl");
    expect(entry).toHaveAttribute(
      kind === "tabs" ? "aria-selected" : "aria-current",
      "true",
    );
  },
);
