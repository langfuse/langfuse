import { fireEvent, render, screen } from "@testing-library/react";
import { WorkspaceTree } from "./WorkspaceTree";

describe("WorkspaceTree", () => {
  it("opens the folder overview from the top-level workspace item", () => {
    render(
      <WorkspaceTree
        projectId="project-1"
        selection={{
          kind: "prompt",
          path: ["support", "triage-agent"],
        }}
        activePromptStage="iterate"
      />,
    );

    expect(
      screen.getByRole("link", { name: /support/i }).getAttribute("href"),
    ).toBe("/project/project-1/greenfield/workspace/folder/support");
    expect(
      screen.getByRole("link", { name: /triage agent/i }).getAttribute("href"),
    ).toBe(
      "/project/project-1/greenfield/workspace/prompt/support/triage-agent/iterate",
    );
  });

  it("uses compact spacing for nested workspace buttons", () => {
    const { container } = render(
      <WorkspaceTree
        projectId="project-1"
        selection={{
          kind: "prompt",
          path: ["support", "triage-agent"],
        }}
        activePromptStage="iterate"
      />,
    );

    const parentLink = screen.getByRole("link", { name: /support/i });
    const childLink = screen.getByRole("link", { name: /triage agent/i });
    const childBranch = container.querySelector(".border-l");
    const parentRow = parentLink.closest(".min-h-9");
    const childRow = childLink.closest(".min-h-8");

    expect(parentRow?.className).toContain("min-h-9");
    expect(childRow?.className).toContain("min-h-8");
    expect(childLink.getAttribute("style")).toBeNull();
    expect(childBranch?.className).toContain("ml-3");
    expect(childBranch?.className).toContain("space-y-0.5");
    expect(childBranch?.className).toContain("pl-0.5");
    expect(screen.getByRole("link", { name: /reply drafter/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /priority router/i })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /resolution checker/i }),
    ).toBeTruthy();
  });

  it("collapses and expands folder children from the chevron toggle", () => {
    render(
      <WorkspaceTree
        projectId="project-1"
        selection={{
          kind: "prompt",
          path: ["support", "triage-agent"],
        }}
        activePromptStage="iterate"
      />,
    );

    expect(screen.getByRole("link", { name: /triage agent/i })).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: /toggle support folder/i }),
    );
    expect(screen.queryByRole("link", { name: /triage agent/i })).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: /toggle support folder/i }),
    );
    expect(screen.getByRole("link", { name: /triage agent/i })).toBeTruthy();
  });

  it("shows prompt stage links for the selected prompt using prompt tab order", () => {
    render(
      <WorkspaceTree
        projectId="project-1"
        selection={{
          kind: "prompt",
          path: ["support", "triage-agent"],
        }}
        activePromptStage="monitor"
      />,
    );

    expect(screen.getByRole("link", { name: /^iterate$/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /^evaluate$/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /^deploy$/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /^monitor$/i })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /^monitor$/i }).className,
    ).toContain("bg-background");
  });
});
