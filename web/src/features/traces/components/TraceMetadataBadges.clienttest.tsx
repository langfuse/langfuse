// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import {
  SessionBadge,
  TargetTraceBadge,
  UserIdBadge,
} from "./TraceMetadataBadges";
import { EnvironmentBadge } from "./ObservationMetadataBadgesSimple/ObservationMetadataBadgesSimple";
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

    // The session id renders as visible quiet text, so the mask must sit
    // directly on the link, not just in a title attr.
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
    // Quiet reference-link styling: muted mono text, no pill box.
    expect(screen.getByText("customer-session").closest("a")).toHaveClass(
      "text-muted-foreground",
    );
    // Environment renders as quiet key/value text, not a boxed chip.
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

  it("shows the total only, never the input/output split, inline", () => {
    render(
      <UsageBadge
        inputUsage={9618}
        outputUsage={582}
        totalUsage={10200}
        usageDetails={{ input: 9618, output: 582, total: 10200 }}
      />,
    );

    expect(screen.getByText("∑ 10,200")).toBeInTheDocument();
    expect(screen.queryByText(/9,618/)).not.toBeInTheDocument();
    expect(screen.queryByText(/→/)).not.toBeInTheDocument();
  });
});
