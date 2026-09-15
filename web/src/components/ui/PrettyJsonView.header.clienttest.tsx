import { render, screen, within } from "@testing-library/react";
import { type ReactNode } from "react";

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

import { MarkdownContextProvider } from "@/src/features/theming/useMarkdownContext";
import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";

function renderPrettyJson(ui: ReactNode) {
  return render(<MarkdownContextProvider>{ui}</MarkdownContextProvider>);
}

const json = { brand: "Acme", count: 2 };

describe("PrettyJsonView table header visibility", () => {
  it("renders no Path / Value header under a title", () => {
    renderPrettyJson(<PrettyJsonView json={json} title="Metadata" />);

    expect(screen.queryByText("Path")).not.toBeInTheDocument();
    expect(screen.queryByText("Value")).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("table")).getByText("brand"),
    ).toBeInTheDocument();
  });

  it("renders no header on an untitled table and keeps the cell copy control", () => {
    renderPrettyJson(<PrettyJsonView json={json} />);

    expect(screen.queryByText("Path")).not.toBeInTheDocument();
    expect(screen.queryByText("Value")).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Copy cell value" }).length,
    ).toBeGreaterThan(0);
    expect(
      within(screen.getByRole("table")).getByText("brand"),
    ).toBeInTheDocument();
  });
});
