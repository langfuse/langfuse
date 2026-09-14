import { render, screen } from "@testing-library/react";

import { ReleaseBadge } from "./ObservationMetadataBadgesSimple";

describe("ReleaseBadge", () => {
  it("shows an observation release as quiet key/value text", () => {
    const { container } = render(<ReleaseBadge release="181" />);

    expect(screen.getByText("181")).toBeInTheDocument();
    expect(container).toHaveTextContent("release 181");
    expect(screen.getByText("181")).toHaveClass("text-foreground/80");
    expect(container.querySelector("[data-session-header-pill]")).toBeNull();
  });

  it("hides when no release is available", () => {
    const { container } = render(<ReleaseBadge release={null} />);

    expect(container).toBeEmptyDOMElement();
  });
});
