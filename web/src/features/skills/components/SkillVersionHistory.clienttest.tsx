import { fireEvent, render, screen } from "@testing-library/react";
import { SkillVersionHistory } from "./SkillVersionHistory";

describe("SkillVersionHistory", () => {
  it("shows an unreleased draft as the only entry before creation", () => {
    render(<SkillVersionHistory kind="new" />);

    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(screen.getByText("Unreleased local changes")).toBeInTheDocument();
    expect(screen.queryByText(/Version \d/)).not.toBeInTheDocument();
  });

  it("guards version changes when the draft is dirty", () => {
    const onSelect = vi.fn(async () => undefined);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(
      <SkillVersionHistory
        kind="versions"
        versions={[
          {
            version: 1,
            labels: ["staging"],
            commitMessage: null,
            createdAt: new Date("2026-09-17T08:30:00.000Z"),
          },
          {
            version: 2,
            labels: ["production"],
            commitMessage: "Published version",
            createdAt: new Date("2026-09-18T08:30:00.000Z"),
          },
        ]}
        selectedVersion={2}
        dirty
        onSelect={onSelect}
      />,
    );

    expect(screen.getByText("Unreleased local changes")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /# 1/ }));

    expect(confirm).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("shows version labels and can collapse the history rail", () => {
    const latestCreatedAt = new Date("2026-09-18T08:30:00.000Z");
    render(
      <SkillVersionHistory
        kind="versions"
        versions={[
          {
            version: 1,
            labels: ["staging"],
            commitMessage: null,
            createdAt: new Date("2026-09-17T08:30:00.000Z"),
          },
          {
            version: 2,
            labels: ["production", "canary"],
            commitMessage: "Clarify escalation steps",
            createdAt: latestCreatedAt,
          },
        ]}
        selectedVersion={2}
        dirty={false}
        onSelect={vi.fn(async () => undefined)}
      />,
    );

    expect(screen.getByText("production")).toBeInTheDocument();
    expect(screen.getByText("canary")).toBeInTheDocument();
    expect(screen.getByText("staging")).toBeInTheDocument();
    expect(screen.getByText("Clarify escalation steps")).toBeInTheDocument();
    expect(
      screen.getByText(latestCreatedAt.toLocaleString()),
    ).toBeInTheDocument();
    expect(screen.queryByText("Version 2")).not.toBeInTheDocument();
    expect(screen.queryByText("Unreleased local changes")).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "Collapse version history" }),
    );

    expect(
      screen.queryByText("Clarify escalation steps"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Expand version history" }),
    ).toBeInTheDocument();
  });
});
