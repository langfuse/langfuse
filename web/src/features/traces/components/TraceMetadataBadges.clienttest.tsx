// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import {
  SessionBadge,
  TargetTraceBadge,
  UserIdBadge,
} from "./TraceMetadataBadges";

describe("TraceMetadataBadges session replay privacy", () => {
  it("blocks trace identifiers from PostHog session recordings", () => {
    render(
      <>
        <SessionBadge sessionId="customer-session" projectId="project" />
        <UserIdBadge userId="customer-user" projectId="project" />
        <TargetTraceBadge targetTraceId="target-trace" projectId="project" />
      </>,
    );

    expect(
      screen.getByText("Session: customer-session").closest("a"),
    ).toHaveClass("ph-no-capture");
    expect(screen.getByText("User ID: customer-user").closest("a")).toHaveClass(
      "ph-no-capture",
    );
    expect(
      screen.getByText("Target Trace: target-trace").closest("a"),
    ).toHaveClass("ph-no-capture");
  });
});
