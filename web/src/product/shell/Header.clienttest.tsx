import { render, screen } from "@testing-library/react";
import { ProductHeader } from "./Header";

describe("ProductHeader", () => {
  it("does not render the sidebar trigger icon", () => {
    render(
      <ProductHeader
        breadcrumbs={[
          { name: "Support", href: "/project/test" },
          { name: "Triage Agent" },
        ]}
      />,
    );

    expect(screen.queryByLabelText("Toggle Sidebar")).toBeNull();
    expect(screen.getByText("Support")).toBeTruthy();
    expect(screen.getByText("Triage Agent")).toBeTruthy();
  });
});
