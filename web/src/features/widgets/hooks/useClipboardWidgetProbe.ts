import { useEffect, useState } from "react";

export type ClipboardWidgetProbe = "unknown" | "widget" | "no-widget";

/**
 * Best-effort check whether the clipboard currently holds a pasteable
 * payload, used to gate "Paste" menu items. The probe only reads the
 * clipboard when the browser allows doing so silently (clipboard-read
 * permission already granted); otherwise it stays "unknown" — the menu item
 * then stays visible and the paste action validates on click. It never
 * triggers a permission prompt on menu open.
 *
 * @param enabled probe when true (typically: the menu is open)
 * @param isPasteable decides whether clipboard text is a pasteable payload;
 *   pass a stable reference (useCallback) — it is an effect dependency
 */
export function useClipboardWidgetProbe(
  enabled: boolean,
  isPasteable: (text: string) => boolean,
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
        setProbe(isPasteable(text) ? "widget" : "no-widget");
      } catch {
        // Permission query unsupported (Firefox/Safari) or read failed —
        // cannot know silently, keep "unknown".
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, isPasteable]);

  return probe;
}
