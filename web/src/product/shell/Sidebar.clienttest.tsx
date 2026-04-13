import { render, screen } from "@testing-library/react";
import { SidebarProvider } from "@/src/components/ui/sidebar";
import { ProductSidebar } from "./Sidebar";

jest.mock("../../components/LangfuseLogo", () => ({
  LangfuseLogo: () => <div data-testid="langfuse-logo" />,
}));

function getSidebarSurface(container: HTMLElement) {
  return container.querySelector('[data-sidebar="sidebar"]')?.parentElement;
}

describe("ProductSidebar", () => {
  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: jest.fn().mockImplementation(() => ({
        matches: false,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      })),
    });
  });

  it("uses the neutral greenfield sidebar palette", () => {
    const { container } = render(
      <SidebarProvider>
        <div className="flex h-dvh w-full">
          <ProductSidebar
            projectId="project-1"
            activeSection="overview"
            workspaceSelection={{
              kind: "prompt",
              path: ["support", "triage-agent"],
            }}
            activePromptStage="monitor"
          />
        </div>
      </SidebarProvider>,
    );

    const sidebarSurface = getSidebarSurface(container);

    expect(sidebarSurface?.style.getPropertyValue("--sidebar-background")).toBe(
      "60 4% 95.1%",
    );
    expect(sidebarSurface?.style.getPropertyValue("--sidebar-accent")).toBe(
      "60 4% 92.5%",
    );
    expect(sidebarSurface?.style.getPropertyValue("--sidebar-border")).toBe(
      "60 4% 88%",
    );
    expect(screen.getByRole("link", { name: /overview/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /support/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /triage agent/i })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /instrument/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /live app/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /settings/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /reply drafter/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /golden cases/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /release ops/i })).toBeNull();
  });
});
