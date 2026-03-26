import { useEffect } from "react";

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
        callback().catch((err) => console.error(err));
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);

    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [isEnabled, callback]);
}
