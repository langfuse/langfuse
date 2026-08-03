import { useEffect } from "react";
import { captureUnknownError } from "@/src/utils/captureUnknownError";

export default function useCommandEnter(
  isEnabled: boolean,
  callback: () => Promise<void>,
) {
  useEffect(() => {
    const isMac = window.navigator.userAgent.includes("Mac");

    function handleKeyDown(event: KeyboardEvent) {
      const hasRunAllModifier = isMac ? event.metaKey : event.ctrlKey;

      if (isEnabled && hasRunAllModifier && event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        callback().catch((err) => captureUnknownError("playground.run", err));
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);

    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [isEnabled, callback]);
}
