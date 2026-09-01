// @vitest-environment node

import {
  captureIoFormatToggle,
  ioFormatToggleProperties,
  shouldCaptureIoFormatToggle,
  toIoFormatToggleView,
} from "./ioFormatToggleContext";

describe("toIoFormatToggleView", () => {
  it("maps pretty-beta onto pretty and leaves json variants", () => {
    expect(toIoFormatToggleView("pretty")).toBe("pretty");
    expect(toIoFormatToggleView("pretty-beta")).toBe("pretty");
    expect(toIoFormatToggleView("json")).toBe("json");
    expect(toIoFormatToggleView("json-beta")).toBe("json-beta");
  });
});

describe("shouldCaptureIoFormatToggle", () => {
  it("fires only when crossing formatted vs JSON", () => {
    expect(shouldCaptureIoFormatToggle("pretty", "json")).toBe(true);
    expect(shouldCaptureIoFormatToggle("pretty-beta", "json-beta")).toBe(true);
    expect(shouldCaptureIoFormatToggle("json", "pretty")).toBe(true);
    expect(shouldCaptureIoFormatToggle("pretty", "pretty-beta")).toBe(false);
    expect(shouldCaptureIoFormatToggle("json", "json-beta")).toBe(false);
  });
});

describe("ioFormatToggleProperties", () => {
  it("omits undefined fields rather than guessing", () => {
    expect(ioFormatToggleProperties({})).toEqual({});
    expect(ioFormatToggleProperties({ observationType: "GENERATION" })).toEqual(
      { observationType: "GENERATION" },
    );
    expect(ioFormatToggleProperties({ ioField: "output" })).toEqual({
      ioField: "output",
    });
  });
});

describe("captureIoFormatToggle", () => {
  it("dual-writes view and renderMarkdown with observation context", () => {
    const capture = vi.fn();
    captureIoFormatToggle(capture, "json", { observationType: "TOOL" });

    expect(capture).toHaveBeenCalledTimes(2);
    expect(capture).toHaveBeenCalledWith("trace_detail:io_mode_switch", {
      view: "json",
      observationType: "TOOL",
    });
    expect(capture).toHaveBeenCalledWith(
      "trace_detail:io_pretty_format_toggle_group",
      { renderMarkdown: false, observationType: "TOOL" },
    );
  });

  it("maps pretty to renderMarkdown true and includes ioField when known", () => {
    const capture = vi.fn();
    captureIoFormatToggle(capture, "pretty", {
      observationType: "trace",
      ioField: "output",
    });

    expect(capture).toHaveBeenCalledWith("trace_detail:io_mode_switch", {
      view: "pretty",
      observationType: "trace",
      ioField: "output",
    });
    expect(capture).toHaveBeenCalledWith(
      "trace_detail:io_pretty_format_toggle_group",
      {
        renderMarkdown: true,
        observationType: "trace",
        ioField: "output",
      },
    );
  });

  it("maps json-beta to renderMarkdown false", () => {
    const capture = vi.fn();
    captureIoFormatToggle(capture, "json-beta", {
      observationType: "GENERATION",
    });

    expect(capture).toHaveBeenCalledWith(
      "trace_detail:io_pretty_format_toggle_group",
      { renderMarkdown: false, observationType: "GENERATION" },
    );
  });
});
