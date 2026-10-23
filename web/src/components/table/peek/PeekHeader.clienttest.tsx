import { type ComponentProps } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PeekHeader } from "./PeekHeader";
import { type EntityTitle } from "@/src/components/EntityTitle";

vi.mock("@/src/hooks/useElementSize", () => ({
  useElementSize: () => [{ current: null }, null],
}));
vi.mock("@/src/features/navigate-detail-pages", () => ({
  DetailPageNav: () => null,
}));
vi.mock("@/src/components/EntityTitle", () => ({
  EntityTitle: ({ type, title }: ComponentProps<typeof EntityTitle>) => (
    <span data-testid="entity-title" data-entity-type={type}>
      {title}
    </span>
  ),
}));

describe("PeekHeader title control", () => {
  it("replaces the entity icon with the control before the title", () => {
    render(
      <PeekHeader
        itemType="SESSION"
        itemId="trace-1"
        title="session-1"
        titleControl={<button>Scope switch</button>}
        onClose={vi.fn()}
      />,
    );
    const title = screen.getByTestId("entity-title");
    expect(title).toHaveTextContent("session-1");
    expect(title).not.toHaveAttribute("data-entity-type");
    expect(
      screen
        .getByRole("button", { name: "Scope switch" })
        .compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("preserves the entity icon for peeks without a title control", () => {
    render(
      <PeekHeader
        itemType="TRACE"
        itemId="trace-1"
        title="trace-1"
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId("entity-title")).toHaveAttribute(
      "data-entity-type",
      "TRACE",
    );
  });
});
