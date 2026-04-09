import { render, screen } from "@testing-library/react";
import { ActivityWidget } from "./ActivityWidget";

describe("ActivityWidget", () => {
  it("renders with a local container-query root", () => {
    render(<ActivityWidget />);

    const widget = screen.getByTestId("spielwiese-activity-widget");
    expect(widget.className).toContain("@container");
  });
});
