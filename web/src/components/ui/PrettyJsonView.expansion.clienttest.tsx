import { fireEvent, render, screen, within } from "@testing-library/react";
import { type ReactNode } from "react";

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

import { MarkdownContextProvider } from "@/src/features/theming/useMarkdownContext";
import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";

function renderPrettyJson(ui: ReactNode) {
  return render(<MarkdownContextProvider>{ui}</MarkdownContextProvider>);
}

function prettyTable() {
  return screen.getByRole("table");
}

describe("PrettyJsonView short-list expansion", () => {
  it("keeps a short primitive list collapsed so the preview is not duplicated", () => {
    renderPrettyJson(
      <PrettyJsonView
        json={{
          brand: "Acme",
          channels: ["email", "paid_social"],
        }}
        title="Input"
      />,
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
      <PrettyJsonView
        json={{
          channels: ["email", "paid_social"],
        }}
        title="Input"
      />,
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
    expect(within(expandedTable).getByText('"email"')).toBeInTheDocument();
    expect(
      within(expandedTable).getByText('"paid_social"'),
    ).toBeInTheDocument();
  });

  it("keeps the parent preview when every expanded child is hidden", () => {
    renderPrettyJson(
      <PrettyJsonView
        json={{
          flags: [null, 0, ""],
        }}
        title="Input"
        showNullValues={false}
      />,
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
      <PrettyJsonView
        json={{
          quoted: ['a"b'],
        }}
        title="Input"
      />,
    );

    expect(within(prettyTable()).getByText('["a\\"b"]')).toBeInTheDocument();
  });

  it("still expands a short list of objects and previews the collapsed object fields", () => {
    renderPrettyJson(
      <PrettyJsonView
        json={{
          users: [{ name: "Ada" }],
        }}
        title="Input"
      />,
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
      <PrettyJsonView
        json={{
          users: [{ name: "Ada" }],
        }}
        title="Input"
      />,
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
    expect(within(expandedTable).getByText('"Ada"')).toBeInTheDocument();
  });
});
