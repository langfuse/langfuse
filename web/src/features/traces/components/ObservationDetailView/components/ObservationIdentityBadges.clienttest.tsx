// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";

import { ObservationIdentityBadges } from "@/src/features/traces/components/ObservationDetailView/components/ObservationIdentityBadges";

describe("ObservationIdentityBadges", () => {
  it("hides identity values already shown in the trace summary", () => {
    render(
      <ObservationIdentityBadges
        projectId="project"
        observationSessionId="shared-session"
        observationUserId="shared-user"
        traceSessionId="shared-session"
        traceUserId="shared-user"
      />,
    );

    expect(
      screen.queryByText("Session: shared-session"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("User ID: shared-user")).not.toBeInTheDocument();
  });

  it("keeps observation-specific identity values", () => {
    render(
      <ObservationIdentityBadges
        projectId="project"
        observationSessionId="observation-session"
        observationUserId="observation-user"
        traceSessionId="trace-session"
        traceUserId="trace-user"
      />,
    );

    expect(
      screen.getByText("Session: observation-session"),
    ).toBeInTheDocument();
    expect(screen.getByText("User ID: observation-user")).toBeInTheDocument();
  });

  it("does not add identity badges when only the trace has values", () => {
    render(
      <ObservationIdentityBadges
        projectId="project"
        observationSessionId={undefined}
        observationUserId={null}
        traceSessionId="trace-session"
        traceUserId="trace-user"
      />,
    );

    expect(screen.queryByText(/Session:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/User ID:/)).not.toBeInTheDocument();
  });
});
