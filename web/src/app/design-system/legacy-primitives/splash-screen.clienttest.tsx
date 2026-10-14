import { fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SplashScreen } from "./splash-screen";

describe("SplashScreen video autoplay", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hides the player when play() rejects with NotSupportedError", async () => {
    vi.spyOn(window.HTMLMediaElement.prototype, "play").mockRejectedValue(
      new DOMException(
        "The media resource indicated by the src attribute or assigned media provider object was not suitable.",
        "NotSupportedError",
      ),
    );

    const { container } = render(
      <SplashScreen
        title="Time to log your first trace"
        description="Get your API keys first."
        videoSrc="https://example.com/onboarding.mp4"
      />,
    );

    const video = container.querySelector("video");
    expect(video).not.toBeNull();
    expect(video).not.toHaveAttribute("autoplay");

    fireEvent.loadedData(video!);

    await waitFor(() => {
      expect(video!.parentElement).toHaveClass("hidden");
    });
  });

  it("keeps the player visible when play() is rejected as NotAllowedError", async () => {
    const play = vi
      .spyOn(window.HTMLMediaElement.prototype, "play")
      .mockRejectedValue(
        new DOMException(
          "play() failed because the user didn't interact with the document first",
          "NotAllowedError",
        ),
      );

    const { container } = render(
      <SplashScreen
        title="Time to log your first trace"
        description="Get your API keys first."
        videoSrc="https://example.com/onboarding.mp4"
      />,
    );

    const video = container.querySelector("video");
    expect(video).not.toBeNull();
    fireEvent.loadedData(video!);

    await waitFor(() => {
      expect(play).toHaveBeenCalled();
    });
    expect(video!.parentElement).not.toHaveClass("hidden");
  });
});
