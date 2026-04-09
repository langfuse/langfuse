import { render, screen } from "@testing-library/react";
import { ActivityRail } from "./ActivityRail";

describe("ActivityRail", () => {
  it("renders with a local container-query root", () => {
    render(
      <ActivityRail
        activity={{
          title: "Review queue",
          description: "Queue details",
          items: [
            {
              id: "item-1",
              label: "Safety pass pending",
              detail: "Support triage",
              value: "09:40",
            },
          ],
        }}
      />,
    );

    const widget = screen.getByTestId("spielwiese-activity-rail");
    expect(widget.className).toContain("@container");
  });
});
