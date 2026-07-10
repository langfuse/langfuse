import { useEffect, useState } from "react";
import { parsePastedWidget } from "@/src/features/widgets/utils/import-export-utils";

export type ClipboardWidgetProbe = "unknown" | "widget" | "no-widget";

/**
 * Best-effort check whether the clipboard currently holds a Langfuse widget
 * JSON, used to gate "Paste widget" menu items. The probe only reads the
 * clipboard when the browser allows doing so silently (clipboard-read
 * permission already granted); otherwise it stays "unknown" — the menu item
 * then stays visible and the paste action validates on click. It never
 * triggers a permission prompt on menu open.
 *
 * @param enabled probe when true (typically: the menu is open)
 */
export function useClipboardWidgetProbe(
  enabled: boolean,
  isBetaEnabled: boolean,
): ClipboardWidgetProbe {
  const [probe, setProbe] = useState<ClipboardWidgetProbe>("unknown");

  useEffect(() => {
    if (!enabled) {
      setProbe("unknown");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        if (
          !navigator.permissions?.query ||
          typeof navigator.clipboard?.readText !== "function"
        ) {
          return;
        }
        const status = await navigator.permissions.query({
          // Not in TS's PermissionName union everywhere, but supported by
          // Chromium; browsers without it throw and we stay "unknown".
          name: "clipboard-read" as PermissionName,
        });
        if (status.state !== "granted") return;
        const text = await navigator.clipboard.readText();
        if (cancelled) return;
        setProbe(
          parsePastedWidget(text, { isBetaEnabled }).status === "widget"
            ? "widget"
            : "no-widget",
        );
      } catch {
        // Permission query unsupported (Firefox/Safari) or read failed —
        // cannot know silently, keep "unknown".
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, isBetaEnabled]);

  return probe;
}
