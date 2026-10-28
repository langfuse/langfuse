import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { ExternalMediaView } from "./ExternalMediaView";

const mockRefreshIfNeeded = vi.fn().mockResolvedValue(undefined);
let mockResolvedMedia = {
  status: "ready" as "ready" | "loading" | "error" | "idle",
  url: "https://signed.example.com/image.png" as string | undefined,
  contentLength: 1024,
  refreshIfNeeded: mockRefreshIfNeeded,
};

let mockFeatureEnabled = true;

vi.mock("@/src/hooks/useProjectIdFromURL", () => ({
  default: () => "project-1",
}));

vi.mock("@/src/features/feature-flags", () => ({
  useIsFeatureEnabled: () => mockFeatureEnabled,
}));

vi.mock("./useResolvedExternalMedia", () => ({
  useResolvedExternalMedia: () => mockResolvedMedia,
}));

vi.mock("./MediaFileView", () => ({
  MediaFileView: ({ src }: { src: string }) => (
    <div data-testid="media-file-view">{src}</div>
  ),
}));

const descriptor = {
  kind: "s3",
  contentType: "image/png",
  uri: "s3://my-bucket/path/image.png",
} as const;

describe("ExternalMediaView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFeatureEnabled = true;
    mockResolvedMedia = {
      status: "ready",
      url: "https://signed.example.com/image.png",
      contentLength: 1024,
      refreshIfNeeded: mockRefreshIfNeeded,
    };
  });

  it("renders raw URI fallback when externalMediaStorage feature flag is disabled", () => {
    mockFeatureEnabled = false;
    render(<ExternalMediaView descriptor={descriptor} />);

    expect(
      screen.getByText("s3://my-bucket/path/image.png"),
    ).toBeInTheDocument();
  });

  it("renders MediaFileView when media resolution is ready", () => {
    render(<ExternalMediaView descriptor={descriptor} />);

    expect(screen.getByTestId("media-file-view")).toBeInTheDocument();
    expect(
      screen.getByText("https://signed.example.com/image.png"),
    ).toBeInTheDocument();
  });

  it("triggers refreshIfNeeded and renders skeleton when status is error and has not refreshed yet", () => {
    mockResolvedMedia = {
      status: "error",
      url: undefined,
      contentLength: undefined,
      refreshIfNeeded: mockRefreshIfNeeded,
    };

    const { container } = render(<ExternalMediaView descriptor={descriptor} />);

    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
    expect(mockRefreshIfNeeded).toHaveBeenCalledOnce();
  });

  it("renders fallback when status is idle", () => {
    mockResolvedMedia = {
      status: "idle",
      url: undefined,
      contentLength: undefined,
      refreshIfNeeded: mockRefreshIfNeeded,
    };

    render(<ExternalMediaView descriptor={descriptor} />);

    expect(
      screen.getByText("s3://my-bucket/path/image.png"),
    ).toBeInTheDocument();
  });
});
