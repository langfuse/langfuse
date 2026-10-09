import { fireEvent, render, screen } from "@testing-library/react";

import { ExternalMediaView } from "./ExternalMediaView";

const { resolvedMedia, refresh, refreshIfNeeded } = vi.hoisted(() => ({
  resolvedMedia: {
    status: "ready" as const,
    url: "https://signed.example.com/clip.mp3?signature=old",
    contentLength: 42 as number | undefined,
  },
  refresh: vi.fn().mockResolvedValue(undefined),
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
    refresh,
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
    resolvedMedia.url = "https://signed.example.com/clip.mp3?signature=old";
    resolvedMedia.contentLength = 42;
    refresh.mockClear();
    refreshIfNeeded.mockClear();
  });

  it("refreshes the signed URL when expanded media playback fails", () => {
    render(<ExternalMediaView descriptor={descriptor} />);

    const player = screen.getByTestId("media-audio-player");
    fireEvent.error(player);
    fireEvent.error(player);

    expect(refresh).toHaveBeenCalledOnce();
  });

  it("does not auto-expand files larger than 50 MB", () => {
    resolvedMedia.contentLength = 50 * 1024 * 1024 + 1;

    render(<ExternalMediaView descriptor={descriptor} />);

    expect(
      screen.getByRole("button", { name: "Show clip.mp3 inline" }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("media-audio-player")).not.toBeInTheDocument();
  });

  it("remounts the media element when the signed URL changes", () => {
    const { rerender } = render(<ExternalMediaView descriptor={descriptor} />);
    const expiredPlayer = screen.getByTestId("media-audio-player");

    resolvedMedia.url = "https://signed.example.com/clip.mp3?signature=new";
    rerender(<ExternalMediaView descriptor={descriptor} />);

    expect(screen.getByTestId("media-audio-player")).not.toBe(expiredPlayer);
  });

  it("does not auto-expand files when their size is unavailable", () => {
    resolvedMedia.contentLength = undefined;

    render(<ExternalMediaView descriptor={descriptor} />);

    expect(
      screen.getByRole("button", { name: "Show clip.mp3 inline" }),
    ).toBeInTheDocument();
  });
});
