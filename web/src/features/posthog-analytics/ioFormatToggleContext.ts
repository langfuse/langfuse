/**
 * Observation context for IO formatted/JSON toggle analytics.
 *
 * Question: when users flip to raw JSON, is it GENERATION output (markdown
 * distortion) or SPAN/TOOL (tool-arg verification)?
 *
 * Metadata only — never ids, names, or payload content. Omit a field rather
 * than guessing.
 *
 * Live Formatted/JSON tabs fire `trace_detail:io_mode_switch` (`view`). The
 * older `io_pretty_format_toggle_group` (`renderMarkdown`) handlers in
 * JSONView / MarkdownView are unused. Live toggles dual-write both names so
 * either query can split by observationType.
 */

type IoFormatToggleIoField = "input" | "output" | "metadata";

export type IoFormatToggleContext = {
  /** Observation type (GENERATION / SPAN / TOOL / …) or "trace". */
  observationType?: string;
  ioField?: IoFormatToggleIoField;
};

export type IoFormatToggleView = "pretty" | "json" | "json-beta";

export function ioFormatToggleProperties(
  context: IoFormatToggleContext,
): IoFormatToggleContext {
  return {
    ...(context.observationType !== undefined
      ? { observationType: context.observationType }
      : {}),
    ...(context.ioField !== undefined ? { ioField: context.ioField } : {}),
  };
}

type CaptureFn = (
  eventName:
    | "trace_detail:io_mode_switch"
    | "trace_detail:io_pretty_format_toggle_group",
  properties?: Record<string, any> | null,
) => void;

export function captureIoFormatToggle(
  capture: CaptureFn,
  view: IoFormatToggleView,
  context: IoFormatToggleContext = {},
): void {
  const properties = ioFormatToggleProperties(context);
  capture("trace_detail:io_mode_switch", { view, ...properties });
  capture("trace_detail:io_pretty_format_toggle_group", {
    renderMarkdown: view === "pretty",
    ...properties,
  });
}
