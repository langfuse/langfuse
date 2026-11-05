import { fireEvent, render, screen } from "@testing-library/react";

import { type Session } from "next-auth";

import { MonitorsOnboarding } from "./MonitorsOnboarding";

vi.mock(
  "@/src/features/monitors/automations/ConnectedNewMonitorAutomationDialog",
  () => ({
    ConnectedNewMonitorAutomationDialog: ({
      lockedActionType,
    }: {
      lockedActionType?: string;
    }) => <p>New {lockedActionType} automation dialog</p>,
  }),
);

const sessionMock = vi.hoisted(() => ({ data: null as Session | null }));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: sessionMock.data, status: "authenticated" }),
}));
/** signIn sets the session user's admin flag. */
const signIn = ({ admin }: { admin: boolean }) => {
  sessionMock.data = {
    expires: "1",
    user: { admin, organizations: [] },
  } as unknown as Session;
};

const PROJECT_ID = "proj_test123";

describe("MonitorsOnboarding", () => {
  afterEach(() => {
    sessionMock.data = null;
  });

  it("renders the splash header, step titles, and four CTAs", () => {
    render(<MonitorsOnboarding projectId={PROJECT_ID} hasCUDAccess={true} />);

    expect(
      screen.getByText("Catch issues before they impact your users"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Choose where alerts should go"),
    ).toBeInTheDocument();
    expect(screen.getByText("Decide what to monitor")).toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: /Connect Slack/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Connect Webhooks/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Connect Github Actions/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Create Alert/i }),
    ).toBeInTheDocument();
  });

  it("opens the new automation dialog locked to each clicked channel, without leaving the page", () => {
    signIn({ admin: true });
    render(<MonitorsOnboarding projectId={PROJECT_ID} hasCUDAccess={true} />);

    const cases: Array<{ label: RegExp; expected: string }> = [
      { label: /Connect Slack/i, expected: "SLACK" },
      { label: /Connect Webhooks/i, expected: "WEBHOOK" },
      { label: /Connect Github Actions/i, expected: "GITHUB_DISPATCH" },
    ];

    for (const { label, expected } of cases) {
      fireEvent.click(screen.getByRole("button", { name: label }));
      expect(
        screen.getByText(`New ${expected} automation dialog`),
      ).toBeInTheDocument();
    }
    expect(document.querySelector('a[href*="/automations"]')).toBeNull();
  });

  it("disables the channel buttons for users who cannot create automations", () => {
    signIn({ admin: false });
    render(<MonitorsOnboarding projectId={PROJECT_ID} hasCUDAccess={true} />);

    expect(
      screen.getByRole("button", { name: /Connect Slack/i }),
    ).toBeDisabled();
  });

  it("shows the PagerDuty CTA without a Langfuse Cloud region", () => {
    signIn({ admin: true });
    render(<MonitorsOnboarding projectId={PROJECT_ID} hasCUDAccess={true} />);

    const button = screen.getByRole("button", { name: /Connect PagerDuty/i });
    expect(button).not.toHaveTextContent("Internal");
    fireEvent.click(button);
    expect(
      screen.getByText("New PAGERDUTY automation dialog"),
    ).toBeInTheDocument();
  });

  it("links the Create Alert CTA to the project's new-alert route", () => {
    render(<MonitorsOnboarding projectId={PROJECT_ID} hasCUDAccess={true} />);

    const link = screen.getByRole("link", { name: /Create Alert/i });
    expect(link.getAttribute("href")).toBe(`/project/${PROJECT_ID}/alerts/new`);
  });
});
