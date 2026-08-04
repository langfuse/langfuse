import { render, screen } from "@testing-library/react";

import { ReleaseBadge } from "./ObservationMetadataBadgesSimple";

describe("ReleaseBadge", () => {
  it("shows an observation release", () => {
    render(<ReleaseBadge release="181" />);

    expect(screen.getByText("Release: 181")).toBeInTheDocument();
  });

  it("hides when no release is available", () => {
    const { container } = render(<ReleaseBadge release={null} />);

    expect(container).toBeEmptyDOMElement();
  });
});
