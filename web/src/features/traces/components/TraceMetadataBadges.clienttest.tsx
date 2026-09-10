// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import {
  SessionBadge,
  TargetTraceBadge,
  UserIdBadge,
} from "./TraceMetadataBadges";
import { EnvironmentBadge } from "./ObservationMetadataBadgesSimple/ObservationMetadataBadgesSimple";
import { CostUsageBadge } from "./ObservationMetadataBadgesTooltip";

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

    // The session link shows only the label; the id lives in its title, and
    // the mask still sits directly on the link.
    const sessionLink = screen.getByTitle("Session customer-session");
    expect(sessionLink.tagName).toBe("A");
    expect(sessionLink).toHaveClass("ph-no-capture");
    expect(sessionLink).toHaveTextContent("Session");
    expect(sessionLink).not.toHaveTextContent("customer-session");
    // The user id renders in full (it is often an email) — link still masked.
    expect(screen.getByText("customer-user").closest("a")).toHaveClass(
      "ph-no-capture",
    );
    expect(screen.getByText("target-trace").closest("a")).toHaveClass(
      "ph-no-capture",
    );
    // Quiet reference-link styling: muted text, no pill box.
    expect(sessionLink).toHaveClass("text-muted-foreground");
    // Environment renders as quiet key/value text, not a boxed chip.
    expect(screen.getByText("production").closest("span")).not.toBeNull();
    expect(
      screen.getByText("production").closest("span")?.parentElement,
    ).toHaveTextContent("env production");
  });
});

describe("CostUsageBadge", () => {
  it("keeps custom usage details accessible without aggregate token totals, when there is no cost", () => {
    render(
      <CostUsageBadge
        totalCost={null}
        costDetails={undefined}
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

  it("falls back to the total-only token face, never the input/output split, when there is no cost", () => {
    render(
      <CostUsageBadge
        totalCost={null}
        costDetails={undefined}
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

  it("shows cost, not the token total, whenever a cost exists", () => {
    render(
      <CostUsageBadge
        totalCost={0.016079}
        costDetails={{ input: 0.01, output: 0.006079, total: 0.016079 }}
        inputUsage={9618}
        outputUsage={582}
        totalUsage={10200}
        usageDetails={{ input: 9618, output: 582, total: 10200 }}
      />,
    );

    expect(screen.getByText("$0.016079")).toBeInTheDocument();
    expect(screen.queryByText(/∑/)).not.toBeInTheDocument();
  });

  it("renders nothing when there is neither cost nor usage", () => {
    const { container } = render(
      <CostUsageBadge
        totalCost={null}
        costDetails={undefined}
        inputUsage={0}
        outputUsage={0}
        totalUsage={0}
        usageDetails={undefined}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
