import { fireEvent, render, screen } from "@testing-library/react";

const capture = vi.hoisted(() => vi.fn());

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => capture,
}));

vi.mock("@/src/features/feature-flags/hooks/useIsFeatureEnabled", () => ({
  default: () => false,
}));

vi.mock("./IOPreviewJSON", () => ({
  IOPreviewJSON: () => <div data-testid="io-json-beta" />,
}));

vi.mock("./IOPreviewJSONSimple", () => ({
  IOPreviewJSONSimple: () => <div data-testid="io-json" />,
}));

vi.mock("./IOPreviewPretty", () => ({
  IOPreviewPretty: () => <div data-testid="io-pretty" />,
}));

import { IOPreview } from "./IOPreview";

const clickJsonTab = () => {
  const tab = screen.getByRole("tab", { name: "JSON" });
  fireEvent.mouseDown(tab);
  fireEvent.click(tab);
};

describe("IOPreview Formatted/JSON toggle analytics", () => {
  beforeEach(() => {
    capture.mockClear();
    window.localStorage.clear();
  });

  it("dual-writes observationType when flipping to JSON", () => {
    render(
      <IOPreview
        input={{ hello: "world" }}
        output={{ ok: true }}
        projectId="p"
        traceId="t"
        observationType="GENERATION"
      />,
    );

    clickJsonTab();

    expect(capture).toHaveBeenCalledWith("trace_detail:io_mode_switch", {
      view: "json",
      observationType: "GENERATION",
    });
    expect(capture).toHaveBeenCalledWith(
      "trace_detail:io_pretty_format_toggle_group",
      { renderMarkdown: false, observationType: "GENERATION" },
    );
  });

  it("includes TOOL observationType from the session/observation call site", () => {
    render(
      <IOPreview
        input={{ customer_id: "cus_1" }}
        output={{ name: "Maya" }}
        projectId="p"
        traceId="t"
        observationType="TOOL"
      />,
    );

    clickJsonTab();

    expect(capture).toHaveBeenCalledWith(
      "trace_detail:io_mode_switch",
      expect.objectContaining({
        view: "json",
        observationType: "TOOL",
      }),
    );
  });

  it("omits observationType when the caller does not know it", () => {
    render(<IOPreview input={{ hello: "world" }} projectId="p" traceId="t" />);

    clickJsonTab();

    expect(capture).toHaveBeenCalledWith("trace_detail:io_mode_switch", {
      view: "json",
    });
    expect(capture.mock.calls[0][1]).not.toHaveProperty("observationType");
  });
});
