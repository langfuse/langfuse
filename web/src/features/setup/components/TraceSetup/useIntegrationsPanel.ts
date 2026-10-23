import { useRef } from "react";
import { flushSync } from "react-dom";
import type { PanelView, TraceSetupActions, Way } from "./types";

/**
 * Opens and closes the integrations panel, and gives focus back to the control that opened it when that control is
 * still on the page.
 */
export function useIntegrationsPanel(
  actions: Pick<TraceSetupActions, "openPanel" | "closePanel">,
) {
  const returnFocus = useRef<HTMLElement | null>(null);
  return {
    open: (view: PanelView) => {
      returnFocus.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      actions.openPanel(view);
    },
    close: (picked: Way | null) => {
      flushSync(() => actions.closePanel(picked));
      if (returnFocus.current?.isConnected) returnFocus.current.focus();
    },
  };
}
