// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import {
  EnvironmentBadge,
  SessionBadge,
  TargetTraceBadge,
  UserIdBadge,
} from "./TraceMetadataBadges";
import { UsageBadge } from "./ObservationMetadataBadgesTooltip";

describe("TraceMetadataBadges session replay privacy", () => {
  it("blocks trace identifiers from PostHog session recordings", () => {
    render(
      <>
        <SessionBadge sessionId="customer-session" projectId="project" />
        <UserIdBadge userId="customer-user" projectId="project" />
        <TargetTraceBadge targetTraceId="target-trace" projectId="project" />
        <EnvironmentBadge environment="production" />
      </>,
    );

    // The session link is label-only ("Session"); the id lives in the title.
    expect(screen.getByText("Session").closest("a")).toHaveClass(
      "ph-no-capture",
    );
    // The user id renders in full (it is often an email) — link still masked.
    expect(screen.getByText("customer-user").closest("a")).toHaveClass(
      "ph-no-capture",
    );
    expect(screen.getByText("Target trace").closest("a")).toHaveClass(
      "ph-no-capture",
    );
    // Quiet text links, not primary-filled chips.
    expect(screen.getByText("Session").closest("a")).toHaveClass(
      "text-muted-foreground",
    );
    // Environment renders as muted key-value text, not a chip.
    expect(screen.getByText("production").closest("span")).not.toBeNull();
    expect(
      screen.getByText("production").closest("span")?.parentElement,
    ).toHaveTextContent("env: production");
  });
});

describe("UsageBadge", () => {
  it("keeps custom usage details accessible without aggregate token totals", () => {
    render(
      <UsageBadge
        inputUsage={0}
        outputUsage={0}
        totalUsage={0}
        usageDetails={{ audio_seconds: 12 }}
      />,
    );

    expect(
      screen.getByRole("button", { name: "View usage breakdown" }),
    ).toBeInTheDocument();
  });
});
