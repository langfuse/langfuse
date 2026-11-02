import { fireEvent, render, screen } from "@testing-library/react";

import { type Session } from "next-auth";

import type * as EnvModule from "@/src/env.mjs";
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
const cloudRegion = vi.hoisted(() => ({
  value: undefined as string | undefined,
}));
vi.mock("@/src/env.mjs", async (importOriginal) => {
  const actual = await importOriginal<typeof EnvModule>();
  return {
    env: new Proxy(actual.env, {
      get: (target, key) =>
        key === "NEXT_PUBLIC_LANGFUSE_CLOUD_REGION"
          ? cloudRegion.value
          : Reflect.get(target, key),
    }),
  };
});

/** signIn sets the session user's admin flag and the deployment's Cloud region. */
const signIn = ({ admin, region }: { admin: boolean; region?: string }) => {
  sessionMock.data = {
    expires: "1",
    user: { admin, organizations: [] },
  } as unknown as Session;
  cloudRegion.value = region;
};

const PROJECT_ID = "proj_test123";

describe("MonitorsOnboarding", () => {
  afterEach(() => {
    sessionMock.data = null;
    cloudRegion.value = undefined;
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

  it("hides the PagerDuty CTA from users who are not admins", () => {
    signIn({ admin: false, region: "EU" });
    render(<MonitorsOnboarding projectId={PROJECT_ID} hasCUDAccess={true} />);

    expect(
      screen.queryByRole("button", { name: /Connect PagerDuty/i }),
    ).not.toBeInTheDocument();
  });

  it("hides the PagerDuty CTA from admins on self-hosted instances", () => {
    signIn({ admin: true });
    render(<MonitorsOnboarding projectId={PROJECT_ID} hasCUDAccess={true} />);

    expect(
      screen.queryByRole("button", { name: /Connect PagerDuty/i }),
    ).not.toBeInTheDocument();
  });

  it("shows the PagerDuty CTA to Langfuse Cloud admins", () => {
    signIn({ admin: true, region: "EU" });
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
