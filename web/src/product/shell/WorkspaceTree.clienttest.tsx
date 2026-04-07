import { render, screen } from "@testing-library/react";
import { WorkspaceTree } from "./WorkspaceTree";

describe("WorkspaceTree", () => {
  it("uses compact spacing for nested workspace buttons", () => {
    const { container } = render(
      <WorkspaceTree
        projectId="project-1"
        selection={{
          kind: "prompt",
          path: ["support", "triage-agent"],
        }}
      />,
    );

    const parentLink = screen.getByRole("link", { name: /support/i });
    const childLink = screen.getByRole("link", { name: /triage agent/i });
    const childBranch = container.querySelector(".border-l");

    expect(parentLink.className).toContain("min-h-9");
    expect(childLink.className).toContain("min-h-8");
    expect(childLink.getAttribute("style")).toBeNull();
    expect(childBranch?.className).toContain("ml-3");
    expect(childBranch?.className).toContain("space-y-0.5");
    expect(childBranch?.className).toContain("pl-0.5");
  });
});
