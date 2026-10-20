/* eslint-disable @repo/prefer-stories-over-client-tests */
import { fireEvent, render, screen } from "@testing-library/react";

import { FeaturePreviewModal } from "./FeaturePreviewModal";

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} />,
}));

describe("FeaturePreviewModal", () => {
  it("lets users opt into Skill Management without other previews", () => {
    const onToggle = vi.fn();

    render(
      <FeaturePreviewModal
        open
        onOpenChange={vi.fn()}
        state={{ skillManagement: { enabled: false, onToggle } }}
      />,
    );

    fireEvent.click(
      screen.getByRole("switch", { name: "Toggle Skill Management" }),
    );

    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it("renders the session timeline toggle inside Redesigned Session View", () => {
    const onTimelineToggle = vi.fn();

    render(
      <FeaturePreviewModal
        open
        onOpenChange={vi.fn()}
        state={{
          sessionViewV2: { enabled: true, onToggle: vi.fn() },
          sessionViewV2Timeline: {
            enabled: false,
            onToggle: onTimelineToggle,
          },
        }}
      />,
    );

    const timelineToggle = screen.getByRole("switch", {
      name: "Toggle Session Timeline",
    });
    expect(screen.getByRole("link", { name: "Give feedback" })).toHaveAttribute(
      "href",
      "https://github.com/orgs/langfuse/discussions/18687",
    );
    fireEvent.click(timelineToggle);

    expect(onTimelineToggle).toHaveBeenCalledWith(true);
    expect(
      screen.queryByRole("button", { name: /Session Timeline/ }),
    ).not.toBeInTheDocument();
  });
});
