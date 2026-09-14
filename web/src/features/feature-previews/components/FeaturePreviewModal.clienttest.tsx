import { fireEvent, render, screen } from "@testing-library/react";

import { FeaturePreviewModal } from "./FeaturePreviewModal";

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} />,
}));

describe("FeaturePreviewModal", () => {
  it("renders the session timeline toggle inside Compact Session View", () => {
    const onTimelineToggle = vi.fn();

    render(
      <FeaturePreviewModal
        open
        onOpenChange={vi.fn()}
        state={{
          modernSession: { enabled: true, onToggle: vi.fn() },
          sessionTimeline: {
            enabled: false,
            onToggle: onTimelineToggle,
          },
        }}
      />,
    );

    const timelineToggle = screen.getByRole("switch", {
      name: "Toggle Session Timeline",
    });
    fireEvent.click(timelineToggle);

    expect(onTimelineToggle).toHaveBeenCalledWith(true);
    expect(
      screen.queryByRole("button", { name: /Session Timeline/ }),
    ).not.toBeInTheDocument();
  });
});
