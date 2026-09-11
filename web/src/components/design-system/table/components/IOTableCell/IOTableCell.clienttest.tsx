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
  it("reads an empty payload as empty, not as the word null", () => {
    // A payload that carries no value must not read as one — `null` is what a
    // reader takes for data. It gets the em dash, plus the word behind it: a
    // dash alone reaches a screen reader as punctuation.
    for (const data of [null, undefined, ""]) {
      const { unmount } = renderCell({ data });
      expect(screen.queryByText("null")).not.toBeInTheDocument();
      expect(screen.getByText("—")).toBeInTheDocument();
      expect(screen.getByText("No value")).toBeInTheDocument();
      unmount();
    }
  });

  it("keeps a null nested inside a payload", () => {
    renderCell({ data: { context: null } });
    expect(screen.getByText("null")).toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });

  it("shows a skeleton, never the empty placeholder, while loading", () => {
    renderCell({ data: undefined, isLoading: true });
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });
});
