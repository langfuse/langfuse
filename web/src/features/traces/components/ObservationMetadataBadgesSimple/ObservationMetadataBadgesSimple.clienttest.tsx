import { render, screen } from "@testing-library/react";

import { ReleaseBadge } from "./ObservationMetadataBadgesSimple";

describe("ReleaseBadge", () => {
  it("shows an observation release as key-value text", () => {
    const { container } = render(<ReleaseBadge release="181" />);

    expect(screen.getByText("181")).toBeInTheDocument();
    expect(container).toHaveTextContent("release: 181");
  });

  it("hides when no release is available", () => {
    const { container } = render(<ReleaseBadge release={null} />);

    expect(container).toBeEmptyDOMElement();
  });
});
