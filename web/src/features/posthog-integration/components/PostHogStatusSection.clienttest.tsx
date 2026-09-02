import { render, screen } from "@testing-library/react";
import { AnalyticsIntegrationExportSource } from "@langfuse/shared";
import { type RouterOutputs } from "@/src/utils/api";
import { PostHogStatusSection } from "./PostHogStatusSection";

type PostHogIntegrationConfig = NonNullable<
  RouterOutputs["posthogIntegration"]["get"]["config"]
>;

// A healthy, enabled integration. Each test overrides only the fields it is
// about, so an assertion never depends on an unrelated default.
const baseConfig: PostHogIntegrationConfig = {
  projectId: "project-1",
  posthogHostName: "https://us.posthog.com",
  posthogApiKeyDisplay: "phc_...cdef",
  exportSource: AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
  enabled: true,
  createdAt: new Date("2024-01-01T00:00:00Z"),
  lastSyncAt: new Date("2024-06-01T12:00:00Z"),
  lastError: null,
  lastErrorAt: null,
};

const renderSection = (overrides: Partial<PostHogIntegrationConfig> = {}) =>
  render(<PostHogStatusSection config={{ ...baseConfig, ...overrides }} />);

// The destructive styling is the user-visible "this is a problem" signal, so
// the variant is asserted alongside the alert role rather than the class alone.
const expectDestructiveAlert = (): HTMLElement => {
  const alert = screen.getByRole("alert");
  expect(alert.className).toContain("destructive");
  return alert;
};

describe("PostHogStatusSection fault surfacing", () => {
  // Load-bearing: this is the exact state the current page gets wrong. After a
  // customer-config fault the worker sets enabled=false, and the page's only
  // status block is gated behind enabled — so the explanation disappears at the
  // precise moment there is finally something to explain.
  it("renders the fault alert when the integration was auto-disabled", () => {
    renderSection({
      enabled: false,
      lastError: "Blocked hostname detected",
      lastErrorAt: new Date("2024-06-02T09:30:00Z"),
    });

    const alert = expectDestructiveAlert();
    expect(alert).toHaveTextContent("Blocked hostname detected");
    expect(alert).toHaveTextContent(
      new Date("2024-06-02T09:30:00Z").toLocaleString(),
    );
  });

  // A fault can be persisted on a still-enabled integration: only classified
  // customer faults disable, so a transient failure leaves enabled=true. The
  // alert must not be conditional on the disabled state either.
  it("renders the fault alert while the integration is still enabled", () => {
    renderSection({
      enabled: true,
      lastError: "Blocked hostname detected",
      lastErrorAt: new Date("2024-06-02T09:30:00Z"),
    });

    expect(expectDestructiveAlert()).toHaveTextContent(
      "Blocked hostname detected",
    );
  });

  // Guards against an always-on empty alert — the failure mode of hoisting the
  // alert out of its conditional.
  it("renders no alert when there is no persisted fault", () => {
    renderSection({ lastError: null, lastErrorAt: null });

    expect(screen.queryByRole("alert")).toBeNull();
  });

  // The two columns are written together by the worker but are independently
  // nullable in the schema, so the timestamp must be treated as optional rather
  // than fed unguarded into a Date.
  it("renders the fault alert without a bogus date when the timestamp is missing", () => {
    renderSection({
      enabled: false,
      lastError: "Blocked hostname detected",
      lastErrorAt: null,
    });

    expect(expectDestructiveAlert()).toHaveTextContent(
      "Blocked hostname detected",
    );
    expect(screen.queryByText(/Invalid Date/i)).toBeNull();
  });
});

describe("PostHogStatusSection sync line", () => {
  it("shows the last sync time", () => {
    renderSection({ lastSyncAt: new Date("2024-06-01T12:00:00Z") });

    expect(
      screen.getByText(
        new RegExp(
          `Data synced until:\\s*${new Date(
            "2024-06-01T12:00:00Z",
          ).toLocaleString()}`,
        ),
      ),
    ).toBeInTheDocument();
  });

  it("shows the never-synced fallback when no sync has completed", () => {
    renderSection({ lastSyncAt: null });

    expect(
      screen.getByText(/Data synced until:\s*Never \(pending\)/),
    ).toBeInTheDocument();
  });

  // Ruling on the gating question: the sync line always renders, matching the
  // blob storage status section this component mirrors. Gating it on `enabled`
  // would leave a disabled integration with no sync line, so a user-disabled
  // integration (disabled, no fault) would render a bare "Status" header with
  // nothing under it. "When did data last get through?" is also precisely what
  // an admin needs while recovering from an auto-disable.
  it("shows the sync line even when the integration is disabled", () => {
    renderSection({
      enabled: false,
      lastSyncAt: new Date("2024-06-01T12:00:00Z"),
    });

    expect(
      screen.getByText(
        new RegExp(
          `Data synced until:\\s*${new Date(
            "2024-06-01T12:00:00Z",
          ).toLocaleString()}`,
        ),
      ),
    ).toBeInTheDocument();
  });

  it("renders the Status header", () => {
    renderSection();

    expect(screen.getByRole("heading", { name: "Status" })).toBeInTheDocument();
  });
});
