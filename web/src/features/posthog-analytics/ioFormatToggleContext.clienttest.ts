// @vitest-environment node

import {
  captureIoFormatToggle,
  ioFormatToggleProperties,
} from "./ioFormatToggleContext";

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
