import { FileText } from "lucide-react";
import { render, screen } from "@testing-library/react";
import { SpielwieseInsertPanel } from "./SpielwieseInsertPanel";

describe("SpielwieseInsertPanel", () => {
  const insertPanel = {
    tabs: ["Insert", "Format", "Style", "Info"],
    activeTab: "Insert",
    description: "Drag and drop any item to the document.",
    items: [
      {
        id: "page",
        label: "A very long insert label that should stay on one line",
        icon: FileText,
      },
    ],
    linePresets: [
      {
        id: "dots",
        label: "Insert dotted line",
        style: "dots" as const,
      },
    ],
    pageBreakLabel: "Insert Page Break",
    table: {
      rows: 4,
      columns: 6,
      selectedRows: 2,
      selectedColumns: 3,
      helper: "Insert a table with the highlighted number of rows and columns.",
      footerLabel: "Assistant",
    },
  };

  it("renders with a local container-query root", () => {
    render(<SpielwieseInsertPanel insertPanel={insertPanel} />);

    const widget = screen.getByTestId("spielwiese-insert-panel");
    expect(widget.className).toContain("@container");
  });

  it("renders insert item labels with truncate", () => {
    render(<SpielwieseInsertPanel insertPanel={insertPanel} />);

    const label = screen.getByText(insertPanel.items[0].label);
    expect(label.className).toContain("truncate");
  });
});
