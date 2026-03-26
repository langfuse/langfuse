import { useEffect } from "react";

export default function useCommandEnter(
  isEnabled: boolean,
  callback: () => Promise<void>,
) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        isEnabled &&
        (event.metaKey || event.ctrlKey) &&
        event.key === "Enter"
      ) {
        event.preventDefault();
        event.stopPropagation();
        callback().catch((err) => console.error(err));
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);

    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [isEnabled, callback]);
}
