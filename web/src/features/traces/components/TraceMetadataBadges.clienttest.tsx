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

    // The session id now renders as visible text (session pill convention),
    // so the mask must sit directly on the link, not just in a title attr.
    expect(screen.getByText("customer-session").closest("a")).toHaveClass(
      "ph-no-capture",
    );
    // The user id renders in full (it is often an email) — link still masked.
    expect(screen.getByText("customer-user").closest("a")).toHaveClass(
      "ph-no-capture",
    );
    expect(screen.getByText("target-trace").closest("a")).toHaveClass(
      "ph-no-capture",
    );
    // Session header pill styling, not primary-filled chips.
    expect(screen.getByText("customer-session").closest("a")).toHaveClass(
      "text-muted-foreground",
    );
    expect(screen.getByText("customer-session").closest("a")).toHaveAttribute(
      "data-session-header-pill",
      "true",
    );
    // Environment renders as a display pill, not a text chip.
    expect(screen.getByText("production").closest("span")).not.toBeNull();
    expect(
      screen.getByText("production").closest("span")?.parentElement,
    ).toHaveTextContent("env production");
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
