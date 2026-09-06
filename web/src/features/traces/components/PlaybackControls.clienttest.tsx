import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlaybackControls } from "./PlaybackControls";

const h = vi.hoisted(() => ({
  capture: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  stop: vi.fn(),
  isPlaying: false,
  showPlayhead: false,
  viewMode: null as string | null,
  observationCount: 42,
  dimensions: {
    isV4: true,
    traceContext: "fullscreen" as "fullscreen" | "peek" | "annotation",
  },
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => h.capture,
}));

vi.mock("@/src/features/traces/hooks/useTraceAnalyticsDimensions", () => ({
  useTraceAnalyticsDimensions: () => h.dimensions,
}));

vi.mock("use-query-params", async () => {
  const actual = await vi.importActual("use-query-params");
  return {
    ...actual,
    useQueryParam: () => [h.viewMode, vi.fn()] as const,
  };
});

vi.mock("@/src/features/traces/contexts/TraceDataContext", () => ({
  useTraceData: () => ({
    traceDuration: 10,
    observations: Array.from({ length: h.observationCount }, (_, i) => ({
      id: `obs-${i}`,
    })),
  }),
}));

vi.mock("@/src/features/traces/contexts/TraceGraphDataContext", () => ({
  useTraceGraphData: () => ({
    isGraphViewAvailable: true,
    isLoading: false,
  }),
}));

vi.mock("@/src/features/traces/contexts/ViewPreferencesContext", () => ({
  useViewPreferences: () => ({ showGraph: true }),
}));

vi.mock("@/src/features/traces/contexts/SearchContext", () => ({
  useSearch: () => ({ searchQuery: "" }),
}));

vi.mock("@/src/features/traces/contexts/PlayheadContext", () => ({
  usePlayhead: () => ({
    play: h.play,
    pause: h.pause,
    stop: h.stop,
    getPlayheadSec: () => 0,
    subscribePosition: () => () => {},
  }),
  useIsPlaying: () => h.isPlaying,
  useShowPlayhead: () => h.showPlayhead,
}));

const payloadKeys = (call: unknown[]) =>
  call[1] && typeof call[1] === "object" ? Object.keys(call[1] as object) : [];

describe("PlaybackControls analytics", () => {
  beforeEach(() => {
    h.capture.mockClear();
    h.play.mockClear();
    h.pause.mockClear();
    h.stop.mockClear();
    h.isPlaying = false;
    h.showPlayhead = false;
    h.viewMode = null;
    h.observationCount = 42;
    h.dimensions = { isV4: true, traceContext: "fullscreen" };
  });

  it("captures play from tree with observation count, once", () => {
    render(<PlaybackControls />);

    fireEvent.click(
      screen.getByRole("button", { name: "Play trace over time" }),
    );

    expect(h.play).toHaveBeenCalledTimes(1);
    expect(h.capture).toHaveBeenCalledTimes(1);
    expect(h.capture).toHaveBeenCalledWith("trace_detail:playback_play", {
      viewMode: "tree",
      observationCount: 42,
      isV4: true,
      traceContext: "fullscreen",
    });
    expect(payloadKeys(h.capture.mock.calls[0])).toEqual([
      "viewMode",
      "observationCount",
      "isV4",
      "traceContext",
    ]);
  });

  it("captures play from timeline, not tree", () => {
    h.viewMode = "timeline";
    h.observationCount = 7;
    h.dimensions = { isV4: false, traceContext: "peek" };
    render(<PlaybackControls />);

    fireEvent.click(
      screen.getByRole("button", { name: "Play trace over time" }),
    );

    expect(h.capture).toHaveBeenCalledWith("trace_detail:playback_play", {
      viewMode: "timeline",
      observationCount: 7,
      isV4: false,
      traceContext: "peek",
    });
  });

  it("captures pause (not play) when the transport is already running", () => {
    h.isPlaying = true;
    render(<PlaybackControls />);

    fireEvent.click(screen.getByRole("button", { name: "Pause playback" }));

    expect(h.pause).toHaveBeenCalledTimes(1);
    expect(h.play).not.toHaveBeenCalled();
    expect(h.capture).toHaveBeenCalledTimes(1);
    expect(h.capture).toHaveBeenCalledWith("trace_detail:playback_pause", {
      viewMode: "tree",
      observationCount: 42,
      isV4: true,
      traceContext: "fullscreen",
    });
  });

  it("captures stop with the same dimensions as play", () => {
    h.viewMode = "timeline";
    h.showPlayhead = true;
    render(<PlaybackControls />);

    fireEvent.click(screen.getByRole("button", { name: "Stop playback" }));

    expect(h.stop).toHaveBeenCalledTimes(1);
    expect(h.capture).toHaveBeenCalledTimes(1);
    expect(h.capture).toHaveBeenCalledWith("trace_detail:playback_stop", {
      viewMode: "timeline",
      observationCount: 42,
      isV4: true,
      traceContext: "fullscreen",
    });
  });

  it("does not capture stop before a playhead is placed", () => {
    render(<PlaybackControls />);

    const stopButton = screen.getByRole("button", { name: "Stop playback" });
    expect(stopButton).toBeDisabled();
    fireEvent.click(stopButton);

    expect(h.stop).not.toHaveBeenCalled();
    expect(h.capture).not.toHaveBeenCalled();
  });

  it("does not capture when the store pauses without a click", () => {
    render(<PlaybackControls />);
    h.pause();
    expect(h.capture).not.toHaveBeenCalled();
  });
});
