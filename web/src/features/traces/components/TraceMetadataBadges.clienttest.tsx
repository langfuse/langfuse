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

    expect(screen.getByText("session").closest("a")).toHaveClass(
      "ph-no-capture",
    );
    expect(screen.getByText("customer-user").closest("a")).toHaveClass(
      "ph-no-capture",
    );
    expect(screen.getByText("target-trace").closest("a")).toHaveClass(
      "ph-no-capture",
    );
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
