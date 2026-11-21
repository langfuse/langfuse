import { useState } from "react";
import { type StudioWidgetConfig } from "@langfuse/shared";

/** Choosing a view changes the displayed results. The saved default belongs to the editor draft. */
export function useStudioQueryView(
  config: StudioWidgetConfig,
  surface: "dashboard" | "editor",
  onSelectQuery?: (queryId: string) => void,
) {
  const [selection, setSelection] = useState<string>();
  const sources = config.queries.filter((query) => !query.hidden);
  const defaults = config.display.activeQueryIds;
  let defaultValue = "all";
  if (defaults?.length === 1) defaultValue = `query:${defaults[0]}`;
  else if (defaults?.length) defaultValue = "configured";
  const options = sources.map(({ id, label }) => ({
    value: `query:${id}`,
    label: label || id,
  }));
  if (
    defaults?.length &&
    !options.some((option) => option.value === defaultValue)
  )
    options.unshift({
      value: defaultValue,
      label:
        config.queries
          .filter((query) => defaults.includes(query.id))
          .map((query) => query.label || query.id)
          .join(" + ") || "Default view",
    });
  const all = { value: "all", label: "All series" };
  if (defaultValue === "all") options.unshift(all);
  else options.push(all);
  const showPicker =
    sources.length > 1 && (surface === "editor" || Boolean(defaults?.length));
  const value =
    showPicker &&
    selection &&
    options.some((option) => option.value === selection)
      ? selection
      : defaultValue;
  let activeQueryIds = defaults;
  if (value !== defaultValue)
    activeQueryIds =
      value === "all" ? undefined : [value.slice("query:".length)];
  const displayed =
    value === defaultValue
      ? config
      : {
          ...config,
          display: { ...config.display, activeQueryIds },
        };
  return {
    displayed,
    resetView: () => setSelection(undefined),
    picker: showPicker
      ? {
          value,
          options,
          onChange: (next: string) => {
            setSelection(next === defaultValue ? undefined : next);
            if (next.startsWith("query:"))
              onSelectQuery?.(next.slice("query:".length));
          },
        }
      : undefined,
  };
}
