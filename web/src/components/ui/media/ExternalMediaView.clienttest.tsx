import { fireEvent, render, screen } from "@testing-library/react";

import { ExternalMediaView } from "./ExternalMediaView";

const { resolvedMedia, refreshIfNeeded } = vi.hoisted(() => ({
  resolvedMedia: {
    status: "ready" as const,
    url: "https://signed.example.com/clip.mp3?signature=old",
    contentLength: 42 as number | undefined,
  },
  refreshIfNeeded: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/src/features/feature-flags", () => ({
  useIsFeatureEnabled: () => true,
}));

vi.mock("@/src/hooks/useProjectIdFromURL", () => ({
  default: () => "project-1",
}));

vi.mock("./useResolvedExternalMedia", () => ({
  useResolvedExternalMedia: () => ({
    ...resolvedMedia,
    refreshIfNeeded,
  }),
}));

const descriptor = {
  kind: "s3",
  contentType: "audio/mpeg",
  uri: "s3://customer-bucket/media/clip.mp3",
} as const;

describe("ExternalMediaView", () => {
  beforeEach(() => {
    resolvedMedia.contentLength = 42;
    refreshIfNeeded.mockClear();
  });

  it("refreshes the signed URL when expanded media playback fails", () => {
    render(<ExternalMediaView descriptor={descriptor} />);

    fireEvent.error(screen.getByTestId("media-audio-player"));

    expect(refreshIfNeeded).toHaveBeenCalledOnce();
  });

  it("does not auto-expand files larger than 50 MB", () => {
    resolvedMedia.contentLength = 50 * 1024 * 1024 + 1;

    render(<ExternalMediaView descriptor={descriptor} />);

    expect(
      screen.getByRole("button", { name: "Show clip.mp3 inline" }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("media-audio-player")).not.toBeInTheDocument();
  });

  it("does not auto-expand files when their size is unavailable", () => {
    resolvedMedia.contentLength = undefined;

    render(<ExternalMediaView descriptor={descriptor} />);

    expect(
      screen.getByRole("button", { name: "Show clip.mp3 inline" }),
    ).toBeInTheDocument();
  });
});
