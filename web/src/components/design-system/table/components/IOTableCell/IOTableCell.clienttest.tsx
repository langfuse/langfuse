import { render, screen } from "@testing-library/react";
import { IOTableCell } from "./IOTableCell";

// The JSON viewer underneath reads the app's markdown preference. Stubbed
// rather than imported: a design-system file must not reach into `src/features`.
vi.mock("@/src/features/theming/useMarkdownContext", () => ({
  useMarkdownContext: () => ({
    isMarkdownEnabled: false,
    setIsMarkdownEnabled: () => {},
  }),
}));

const renderCell = (props: Partial<Parameters<typeof IOTableCell>[0]> = {}) =>
  render(
    <IOTableCell
      data={undefined}
      renderMediaReference={() => null}
      {...props}
    />,
  );

describe("IOTableCell", () => {
  it("renders nothing for a payload that carries no value", () => {
    // A cell with no payload — because the row has none, or because the query
    // that fetches it has not landed — must not read as a value. The word
    // `null` is what a reader takes for data.
    for (const data of [null, undefined, ""]) {
      const { unmount } = renderCell({ data });
      expect(screen.queryByText("null")).not.toBeInTheDocument();
      unmount();
    }
  });

  it("keeps a null nested inside a payload", () => {
    renderCell({ data: { context: null } });
    expect(screen.getByText("null")).toBeInTheDocument();
  });
});
