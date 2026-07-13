import { render, screen } from "@testing-library/react";

import { TooltipProvider } from "@/src/components/ui/tooltip";
import { StarToggle } from "@/src/components/star-toggle";

/**
 * LFE-10535 (#1/#2): the star button's accessible name, its labeled-menu text,
 * and its tooltip are all derived from `value`, so a screen reader always hears
 * the real bookmark state and every text surface stays in sync with the
 * (optimistic) icon. A stable `data-bookmark-toggle` hook lets the table keep
 * "click the star without closing the peek" decoupled from the human label.
 */
const noop = () => Promise.resolve();

describe("StarToggle accessible name (LFE-10535)", () => {
  it("announces the bookmark state on the icon button", () => {
    const { rerender } = render(
      <StarToggle value={false} isLoading={false} onClick={noop} />,
    );
    expect(
      screen.getByRole("button", { name: "Bookmark" }),
    ).toBeInTheDocument();

    rerender(<StarToggle value={true} isLoading={false} onClick={noop} />);
    expect(
      screen.getByRole("button", { name: "Remove bookmark" }),
    ).toBeInTheDocument();
  });

  it("announces the state in the labeled menu item and shows matching text", () => {
    const { rerender } = render(
      <StarToggle value={false} isLoading={false} onClick={noop} showLabel />,
    );
    expect(screen.getByRole("button", { name: "Bookmark" })).toHaveTextContent(
      "Bookmark",
    );

    rerender(
      <StarToggle value={true} isLoading={false} onClick={noop} showLabel />,
    );
    expect(
      screen.getByRole("button", { name: "Remove bookmark" }),
    ).toHaveTextContent("Remove bookmark");
  });

  it("wires the tooltip onto the real focusable button with a stable behaviour hook", () => {
    render(
      <TooltipProvider>
        <StarToggle value={true} isLoading={false} onClick={noop} tooltip />
      </TooltipProvider>,
    );
    // The accessible name lives on the button itself (TooltipTrigger asChild),
    // not on a wrapping <span> — so SR users hear the tooltip.
    const button = screen.getByRole("button", { name: "Remove bookmark" });
    expect(button).toHaveAttribute("data-bookmark-toggle");
  });
});
