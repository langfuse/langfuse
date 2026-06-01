import { render, screen } from "@testing-library/react";
import { SidebarNotifications, notifications } from "./sidebar-notifications";

const GITHUB_STAR_ID = "github-star";

const mockState = vi.hoisted(() => ({ dismissed: [] as string[] }));

vi.mock("../useLocalStorage", () => ({
  __esModule: true,
  default: () => [mockState.dismissed, vi.fn()],
}));

describe("SidebarNotifications", () => {
  beforeEach(() => {
    // Dismiss every notification except the GitHub star one so it surfaces
    // as the front card regardless of how many launch-week notifications
    // are added over time.
    mockState.dismissed = notifications
      .filter((n) => n.id !== GITHUB_STAR_ID)
      .map((n) => n.id);
  });

  it("renders the GitHub stars badge with social style query params", () => {
    render(<SidebarNotifications />);

    const badge = screen.getByAltText("Langfuse GitHub stars");
    const src = badge.getAttribute("src");

    expect(src).toContain("style=social");
    expect(src).not.toContain("&amp;");
  });
});
