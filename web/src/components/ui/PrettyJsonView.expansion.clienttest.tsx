import { JsonViewController } from "@/src/components/ui/JsonViewController";
import { FoldVertical, UnfoldVertical } from "@langfuse/icons";
import { IOSection } from "@/src/components/ui/IOSection";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { type ReactNode } from "react";
import { copyTextToClipboard } from "@/src/utils/clipboard";

vi.mock("@/src/utils/clipboard", () => ({
  copyTextToClipboard: vi.fn(),
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

import { PrettyJsonViewContent } from "@/src/components/ui/PrettyJsonViewContent";
import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import { getJsonViewContentKind } from "@/src/components/ui/fns/getJsonViewContentKind";

function renderPrettyJson(ui: ReactNode) {
  return render(ui);
}

function prettyTable() {
  return screen.getByRole("table");
}

describe("PrettyJsonView short-list expansion", () => {
  it("owns expansion state without requiring a controller or section at the call site", () => {
    const onExpansionChange = vi.fn();
    render(
      <PrettyJsonView
        json={{ channels: ["email", "paid_social"] }}
        externalExpansionState={false}
        onExternalExpansionChange={onExpansionChange}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Copy to clipboard" }),
    ).not.toBeInTheDocument();
    expect(within(prettyTable()).queryByText("email")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Expand channels" }));

    expect(within(prettyTable()).getByText("email")).toBeInTheDocument();
    expect(onExpansionChange).toHaveBeenCalled();
  });

  it("lets the hosting section copy content and control row expansion", async () => {
    const json = { channels: ["email", "paid_social"] };
    render(
      <JsonViewController json={json}>
        {(state) => (
          <IOSection
            title="Input"
            onCopy={state.copy}
            actions={[
              {
                icon: state.allRowsExpanded ? FoldVertical : UnfoldVertical,
                label: state.allRowsExpanded
                  ? "Collapse all rows"
                  : "Expand all rows",
                onClick: state.toggleAllRows,
              },
            ]}
            variant="table"
          >
            <PrettyJsonViewContent state={state} borderless />
          </IOSection>
        )}
      </JsonViewController>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Expand all rows" }));
    expect(within(prettyTable()).getByText("email")).toBeInTheDocument();

    fireEvent.click(
      await screen.findByRole("button", { name: "Collapse all rows" }),
    );
    expect(within(prettyTable()).queryByText("email")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Copy to clipboard" }));
    expect(copyTextToClipboard).toHaveBeenCalledWith(
      JSON.stringify(json, null, 4),
    );
  });

  it("keeps a short primitive list collapsed so the preview is not duplicated", () => {
    renderPrettyJson(
      <JsonViewController
        json={{
          brand: "Acme",
          channels: ["email", "paid_social"],
        }}
      >
        {(state) => (
          <IOSection
            title="Input"
            onCopy={state.copy}
            actions={
              getJsonViewContentKind(state) === "table" &&
              state.hasExpandableRows
                ? [
                    {
                      icon: state.allRowsExpanded
                        ? FoldVertical
                        : UnfoldVertical,
                      label: state.allRowsExpanded
                        ? "Collapse all rows"
                        : "Expand all rows",
                      onClick: state.toggleAllRows,
                    },
                  ]
                : undefined
            }
            variant={
              getJsonViewContentKind(state) === "table" ? "table" : "text"
            }
          >
            <PrettyJsonViewContent state={state} title="Input" borderless />
          </IOSection>
        )}
      </JsonViewController>,
    );

    const table = prettyTable();
    expect(within(table).getByText("channels")).toBeInTheDocument();
    expect(
      within(table).getByText('["email", "paid_social"]'),
    ).toBeInTheDocument();
    // Child index rows would repeat the same strings next to path 0 / 1.
    expect(within(table).queryByText("0")).not.toBeInTheDocument();
    expect(within(table).queryByText("1")).not.toBeInTheDocument();
  });

  it("hides the parent-row list preview after the user expands it", () => {
    renderPrettyJson(
      <JsonViewController
        json={{
          channels: ["email", "paid_social"],
        }}
      >
        {(state) => (
          <IOSection
            title="Input"
            onCopy={state.copy}
            actions={
              getJsonViewContentKind(state) === "table" &&
              state.hasExpandableRows
                ? [
                    {
                      icon: state.allRowsExpanded
                        ? FoldVertical
                        : UnfoldVertical,
                      label: state.allRowsExpanded
                        ? "Collapse all rows"
                        : "Expand all rows",
                      onClick: state.toggleAllRows,
                    },
                  ]
                : undefined
            }
            variant={
              getJsonViewContentKind(state) === "table" ? "table" : "text"
            }
          >
            <PrettyJsonViewContent state={state} title="Input" borderless />
          </IOSection>
        )}
      </JsonViewController>,
    );

    const table = prettyTable();
    const channelsRow = within(table).getByText("channels").closest("tr");
    expect(channelsRow).not.toBeNull();
    const expandButton = within(channelsRow as HTMLElement).getAllByRole(
      "button",
    )[0];
    fireEvent.click(expandButton!);

    const expandedTable = prettyTable();
    expect(
      within(expandedTable).queryByText('["email", "paid_social"]'),
    ).not.toBeInTheDocument();
    expect(within(expandedTable).getByText("0")).toBeInTheDocument();
    expect(within(expandedTable).getByText("1")).toBeInTheDocument();
    expect(within(expandedTable).getByText("email")).toBeInTheDocument();
    expect(within(expandedTable).getByText("paid_social")).toBeInTheDocument();
  });

  it("keeps the parent preview when every expanded child is hidden", () => {
    renderPrettyJson(
      <JsonViewController
        json={{
          flags: [null, 0, ""],
        }}
        showNullValues={false}
      >
        {(state) => (
          <IOSection
            title="Input"
            onCopy={state.copy}
            actions={
              getJsonViewContentKind(state) === "table" &&
              state.hasExpandableRows
                ? [
                    {
                      icon: state.allRowsExpanded
                        ? FoldVertical
                        : UnfoldVertical,
                      label: state.allRowsExpanded
                        ? "Collapse all rows"
                        : "Expand all rows",
                      onClick: state.toggleAllRows,
                    },
                  ]
                : undefined
            }
            variant={
              getJsonViewContentKind(state) === "table" ? "table" : "text"
            }
          >
            <PrettyJsonViewContent state={state} title="Input" borderless />
          </IOSection>
        )}
      </JsonViewController>,
    );

    const table = prettyTable();
    const flagsRow = within(table).getByText("flags").closest("tr");
    expect(flagsRow).not.toBeNull();
    const expandButton = within(flagsRow as HTMLElement).getAllByRole(
      "button",
    )[0];
    fireEvent.click(expandButton!);

    const expandedTable = prettyTable();
    expect(
      within(expandedTable).getByText('[null, 0, ""]'),
    ).toBeInTheDocument();
    expect(within(expandedTable).queryByText("null")).not.toBeInTheDocument();
  });

  it("escapes quotes in the collapsed list preview", () => {
    renderPrettyJson(
      <JsonViewController
        json={{
          quoted: ['a"b'],
        }}
      >
        {(state) => (
          <IOSection
            title="Input"
            onCopy={state.copy}
            actions={
              getJsonViewContentKind(state) === "table" &&
              state.hasExpandableRows
                ? [
                    {
                      icon: state.allRowsExpanded
                        ? FoldVertical
                        : UnfoldVertical,
                      label: state.allRowsExpanded
                        ? "Collapse all rows"
                        : "Expand all rows",
                      onClick: state.toggleAllRows,
                    },
                  ]
                : undefined
            }
            variant={
              getJsonViewContentKind(state) === "table" ? "table" : "text"
            }
          >
            <PrettyJsonViewContent state={state} title="Input" borderless />
          </IOSection>
        )}
      </JsonViewController>,
    );

    expect(within(prettyTable()).getByText('["a\\"b"]')).toBeInTheDocument();
  });

  it("still expands a short list of objects and previews the collapsed object fields", () => {
    renderPrettyJson(
      <JsonViewController
        json={{
          users: [{ name: "Ada" }],
        }}
      >
        {(state) => (
          <IOSection
            title="Input"
            onCopy={state.copy}
            actions={
              getJsonViewContentKind(state) === "table" &&
              state.hasExpandableRows
                ? [
                    {
                      icon: state.allRowsExpanded
                        ? FoldVertical
                        : UnfoldVertical,
                      label: state.allRowsExpanded
                        ? "Collapse all rows"
                        : "Expand all rows",
                      onClick: state.toggleAllRows,
                    },
                  ]
                : undefined
            }
            variant={
              getJsonViewContentKind(state) === "table" ? "table" : "text"
            }
          >
            <PrettyJsonViewContent state={state} title="Input" borderless />
          </IOSection>
        )}
      </JsonViewController>,
    );

    const table = prettyTable();
    // The list itself expands so each object is a child row. Nested object
    // keys stay collapsed; the object preview shows the short fields.
    expect(within(table).getByText("0")).toBeInTheDocument();
    expect(within(table).getByText('{"name": "Ada"}')).toBeInTheDocument();
    expect(within(table).queryByText("1 items")).not.toBeInTheDocument();
    expect(within(table).queryByText("name")).not.toBeInTheDocument();
  });

  it("hides a short object preview after the user expands it", () => {
    renderPrettyJson(
      <JsonViewController
        json={{
          users: [{ name: "Ada" }],
        }}
      >
        {(state) => (
          <IOSection
            title="Input"
            onCopy={state.copy}
            actions={
              getJsonViewContentKind(state) === "table" &&
              state.hasExpandableRows
                ? [
                    {
                      icon: state.allRowsExpanded
                        ? FoldVertical
                        : UnfoldVertical,
                      label: state.allRowsExpanded
                        ? "Collapse all rows"
                        : "Expand all rows",
                      onClick: state.toggleAllRows,
                    },
                  ]
                : undefined
            }
            variant={
              getJsonViewContentKind(state) === "table" ? "table" : "text"
            }
          >
            <PrettyJsonViewContent state={state} title="Input" borderless />
          </IOSection>
        )}
      </JsonViewController>,
    );

    const table = prettyTable();
    const objectRow = within(table).getByText("0").closest("tr");
    expect(objectRow).not.toBeNull();
    const expandButton = within(objectRow as HTMLElement).getAllByRole(
      "button",
    )[0];
    fireEvent.click(expandButton!);

    const expandedTable = prettyTable();
    expect(
      within(expandedTable).queryByText('{"name": "Ada"}'),
    ).not.toBeInTheDocument();
    expect(within(expandedTable).getByText("name")).toBeInTheDocument();
    expect(within(expandedTable).getByText("Ada")).toBeInTheDocument();
  });
});
