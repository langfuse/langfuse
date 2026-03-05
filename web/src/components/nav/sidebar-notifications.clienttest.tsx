import { render, screen } from "@testing-library/react";
import { SidebarNotifications } from "./sidebar-notifications";

jest.mock("../useLocalStorage", () => ({
  __esModule: true,
  default: () => [[], jest.fn()],
}));

describe("SidebarNotifications", () => {
  it("renders the GitHub stars badge with social style query params", () => {
    render(<SidebarNotifications />);

    const badge = screen.getByAltText("Langfuse GitHub stars");
    const src = badge.getAttribute("src");

    expect(src).toContain("style=social");
    expect(src).not.toContain("&amp;");
  });
});
