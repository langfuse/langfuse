import type { KeyboardEventHandler, MouseEventHandler } from "react";

const VARIABLE_MAPPING_ROOT_SELECTOR = "[data-variable-mapping-root]";

/** Event-delegated dismissal for containers that own variable-mapping state. */
export function getVariableMappingDismissalHandlers(onDismiss: () => void): {
  onClick: MouseEventHandler<HTMLElement>;
  onKeyDownCapture: KeyboardEventHandler<HTMLElement>;
} {
  return {
    onClick: (event) => {
      if (
        event.target instanceof Element &&
        !event.target.closest(VARIABLE_MAPPING_ROOT_SELECTOR)
      ) {
        onDismiss();
      }
    },
    onKeyDownCapture: (event) => {
      if (event.key === "Escape") onDismiss();
    },
  };
}
