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
  it("hides the Path / Value header when a title frames the table", () => {
    renderPrettyJson(<PrettyJsonView json={json} title="Metadata" />);

    expect(screen.queryByText("Path")).not.toBeInTheDocument();
    expect(screen.queryByText("Value")).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("table")).getByText("brand"),
    ).toBeInTheDocument();
  });

  it("keeps the header for standalone tables and when a caller opts in", () => {
    const { unmount } = renderPrettyJson(<PrettyJsonView json={json} />);
    expect(screen.getByText("Path")).toBeInTheDocument();
    unmount();

    renderPrettyJson(
      <PrettyJsonView json={json} title="Metadata" hideHeader={false} />,
    );
    expect(screen.getByText("Path")).toBeInTheDocument();
  });
});
