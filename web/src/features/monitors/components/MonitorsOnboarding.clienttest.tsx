import { render, screen } from "@testing-library/react";

import { MonitorsOnboarding } from "./MonitorsOnboarding";

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
  it("renders the splash header, step titles, and four CTAs", () => {
    render(<MonitorsOnboarding projectId={PROJECT_ID} />);

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
      screen.getByRole("link", { name: /Create Monitor/i }),
    ).toBeInTheDocument();
  });

  it("links each channel button to /automations?view=create with the matching prefill actionType", () => {
    render(<MonitorsOnboarding projectId={PROJECT_ID} />);

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
      expect(decoded.redirectUrl).toBe(`/project/${PROJECT_ID}/monitors`);
    }
  });

  it("links the Create Monitor CTA to the project's new-monitor route", () => {
    render(<MonitorsOnboarding projectId={PROJECT_ID} />);

    const link = screen.getByRole("link", { name: /Create Monitor/i });
    expect(link.getAttribute("href")).toBe(
      `/project/${PROJECT_ID}/monitors/new`,
    );
  });
});
