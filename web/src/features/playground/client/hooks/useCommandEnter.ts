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
        event.code === "Enter"
      ) {
        callback().catch((err) => console.error(err));
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isEnabled, callback]);
}
