import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { V4MigrationDetailsContent } from "./V4MigrationContent";

vi.mock("next/router", () => ({
  useRouter: () => ({ query: {} }),
}));

vi.mock("@/src/features/support-chat/SupportDrawerProvider", () => ({
  useSupportDrawer: () => ({ openWithMode: vi.fn() }),
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

vi.mock("@/src/features/projects/hooks", () => ({
  useProject: () => ({ organization: { id: "org-1" } }),
}));

vi.mock("@/src/features/v4-migration/hooks/useV4MigrationData", () => ({
  useProjectV4MigrationData: () => ({
    sdk: {
      status: "otel_header_required",
      sdkUsageSeries: [],
      upgradeRequiredCount: 0,
      delayedOtelIngestionCount: 1,
    },
    evals: { status: "loaded", count: 0 },
    apis: { status: "loaded", count: 0 },
    exports: { status: "loaded", count: 0 },
    apiUsage: [],
    legacyIntegrations: [],
  }),
}));

describe("V4MigrationDetailsContent", () => {
  it("links delayed OTel users to the v4 migration guide", async () => {
    render(<V4MigrationDetailsContent projectId="project-1" />);

    const trigger = screen.getByRole("button", {
      name: /Tracing Instrumentation/i,
    });
    fireEvent.click(trigger);

    const docsLink = await screen.findByRole("link", {
      name: "OpenTelemetry migration guide",
    });
    expect(docsLink).toHaveAttribute(
      "href",
      "https://langfuse.com/integrations/native/opentelemetry/migration-to-v4",
    );
    expect(docsLink).toHaveAttribute("target", "_blank");
  });
});
