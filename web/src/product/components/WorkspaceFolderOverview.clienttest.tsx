import { render, screen } from "@testing-library/react";
import { WorkspaceFolderOverview } from "./WorkspaceFolderOverview";

describe("WorkspaceFolderOverview", () => {
  it("renders the support overview dashboard", () => {
    render(
      <WorkspaceFolderOverview
        projectId="project-1"
        folderPath={["support"]}
      />,
    );

    expect(screen.getByText("24 hrs")).toBeTruthy();
    expect(screen.getByText("Recent Prompts")).toBeTruthy();
    expect(screen.getByText("Recent Datasets")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Triage agent/i })).toHaveProperty(
      "href",
      expect.stringContaining(
        "/project/project-1/greenfield/workspace/prompt/support/triage-agent/iterate",
      ),
    );
    expect(screen.getByRole("link", { name: /Reply drafter/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Priority router/i })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /Resolution checker/i }),
    ).toBeTruthy();
    expect(screen.getByText("Insight training dataset")).toBeTruthy();
  });
});
