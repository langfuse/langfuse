import { render, screen } from "@testing-library/react";

import { type Session } from "next-auth";

import type * as EnvModule from "@/src/env.mjs";
import { MonitorsOnboarding } from "./MonitorsOnboarding";

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
  sessionMock.data = { expires: "1", user: { admin } } as unknown as Session;
  cloudRegion.value = region;
};

const PROJECT_ID = "proj_test123";

/** parsePrefill decodes the `prefill` query param into the same shape the form's serializer produced. */
const parsePrefill = (
  href: string,
): { eventSource?: string; actionType?: string; redirectUrl?: string } => {
  const url = new URL(href, "http://localhost");
  const raw = url.searchParams.get("prefill");
  if (!raw) return {};
  const padded = raw.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return JSON.parse(new TextDecoder().decode(bytes));
};

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
      screen.getByRole("link", { name: /Connect Slack/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Connect Webhooks/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Connect Github Actions/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Create Alert/i }),
    ).toBeInTheDocument();
  });

  it("links each channel button to /automations?view=create with the matching prefill actionType", () => {
    render(<MonitorsOnboarding projectId={PROJECT_ID} hasCUDAccess={true} />);

    const cases: Array<{ label: RegExp; expected: string }> = [
      { label: /Connect Slack/i, expected: "SLACK" },
      { label: /Connect Webhooks/i, expected: "WEBHOOK" },
      { label: /Connect Github Actions/i, expected: "GITHUB_DISPATCH" },
    ];

    for (const { label, expected } of cases) {
      const link = screen.getByRole("link", { name: label });
      const href = link.getAttribute("href") ?? "";
      expect(href).toContain(`/project/${PROJECT_ID}/automations`);
      expect(href).toContain("view=create");

      const decoded = parsePrefill(href);
      expect(decoded.eventSource).toBe("monitor");
      expect(decoded.actionType).toBe(expected);
      expect(decoded.redirectUrl).toBe(`/project/${PROJECT_ID}/alerts`);
    }
  });

  it("hides the PagerDuty CTA from users who are not admins", () => {
    signIn({ admin: false, region: "EU" });
    render(<MonitorsOnboarding projectId={PROJECT_ID} hasCUDAccess={true} />);

    expect(
      screen.queryByRole("link", { name: /Connect PagerDuty/i }),
    ).not.toBeInTheDocument();
  });

  it("hides the PagerDuty CTA from admins on self-hosted instances", () => {
    signIn({ admin: true });
    render(<MonitorsOnboarding projectId={PROJECT_ID} hasCUDAccess={true} />);

    expect(
      screen.queryByRole("link", { name: /Connect PagerDuty/i }),
    ).not.toBeInTheDocument();
  });

  it("shows the PagerDuty CTA to Langfuse Cloud admins", () => {
    signIn({ admin: true, region: "EU" });
    render(<MonitorsOnboarding projectId={PROJECT_ID} hasCUDAccess={true} />);

    const link = screen.getByRole("link", { name: /Connect PagerDuty/i });
    expect(link).not.toHaveTextContent("Internal");
    expect(parsePrefill(link.getAttribute("href")!).actionType).toBe(
      "PAGERDUTY",
    );
  });

  it("links the Create Alert CTA to the project's new-alert route", () => {
    render(<MonitorsOnboarding projectId={PROJECT_ID} hasCUDAccess={true} />);

    const link = screen.getByRole("link", { name: /Create Alert/i });
    expect(link.getAttribute("href")).toBe(`/project/${PROJECT_ID}/alerts/new`);
  });
});
