import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PreviewDeploymentBanner } from "./PreviewDeploymentBanner";

// Shared mutable mock state (hoisted above the vi.mock factories).
const h = vi.hoisted(() => ({
  env: {} as Record<string, string | undefined>,
}));

vi.mock("@/src/env.mjs", () => ({ env: h.env }));
// The container only reads the offset and registers its height; neither
// affects the rendered content under test.
vi.mock("@/src/features/top-banner", () => ({
  useTopBanner: () => ({ getTopBannerOffset: () => 0 }),
  useTopBannerRegistration: () => {},
}));

describe("PreviewDeploymentBanner", () => {
  afterEach(() => {
    for (const key of Object.keys(h.env)) delete h.env[key];
  });

  it("renders nothing when the preview env vars are unset", () => {
    const { container } = render(<PreviewDeploymentBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("links the PR and the author and shows the update time", () => {
    h.env.NEXT_PUBLIC_PREVIEW_PR_URL =
      "https://github.com/langfuse/langfuse/pull/15580";
    h.env.NEXT_PUBLIC_PREVIEW_PR_AUTHOR = "nmtrang29";
    h.env.NEXT_PUBLIC_PREVIEW_LAST_UPDATED = new Date(
      Date.now() - 2 * 60 * 60 * 1000,
    ).toISOString();

    render(<PreviewDeploymentBanner />);

    expect(screen.getByRole("link", { name: "PR #15580" })).toHaveAttribute(
      "href",
      "https://github.com/langfuse/langfuse/pull/15580",
    );
    expect(screen.getByRole("link", { name: "@nmtrang29" })).toHaveAttribute(
      "href",
      "https://github.com/nmtrang29",
    );
    expect(screen.getByText(/updated about 2 hours ago/)).toBeInTheDocument();
  });

  it("omits the updated segment for an unparsable timestamp", () => {
    h.env.NEXT_PUBLIC_PREVIEW_PR_URL =
      "https://github.com/langfuse/langfuse/pull/1";
    h.env.NEXT_PUBLIC_PREVIEW_LAST_UPDATED = "not-a-date";

    render(<PreviewDeploymentBanner />);

    expect(screen.getByRole("link", { name: "PR #1" })).toBeInTheDocument();
    expect(screen.queryByText(/updated/)).not.toBeInTheDocument();
  });

  it("falls back to a generic link label when the URL has no PR number", () => {
    h.env.NEXT_PUBLIC_PREVIEW_PR_URL = "https://github.com/langfuse/langfuse";

    render(<PreviewDeploymentBanner />);

    expect(
      screen.getByRole("link", { name: "a pull request" }),
    ).toBeInTheDocument();
  });
});
