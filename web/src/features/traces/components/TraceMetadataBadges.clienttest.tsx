// @vitest-environment jsdom

import { render as testingLibraryRender, screen } from "@testing-library/react";
import { type ReactElement, type ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "@/src/features/i18n/messages";
import {
  EnvironmentBadge,
  SessionBadge,
  TargetTraceBadge,
  UserIdBadge,
} from "./TraceMetadataBadges";
import { UsageBadge } from "./ObservationMetadataBadgesTooltip";

const render = (ui: ReactElement) =>
  testingLibraryRender(ui, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <NextIntlClientProvider locale="en" messages={getMessages("en")}>
        {children}
      </NextIntlClientProvider>
    ),
  });

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

    expect(
      screen.getByText("Session: customer-session").closest("a"),
    ).toHaveClass("ph-no-capture");
    expect(screen.getByText("User ID: customer-user").closest("a")).toHaveClass(
      "ph-no-capture",
    );
    expect(
      screen.getByText("Target Trace: target-trace").closest("a"),
    ).toHaveClass("ph-no-capture");
    expect(
      screen.getByText("Session: customer-session").parentElement,
    ).toHaveClass("bg-primary");
    expect(
      screen.getByText("User ID: customer-user").parentElement,
    ).toHaveClass("bg-primary");
    expect(
      screen.getByText("Target Trace: target-trace").parentElement,
    ).toHaveClass("bg-primary");
    expect(screen.getByText("Env: production").parentElement).toHaveClass(
      "bg-tertiary",
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
