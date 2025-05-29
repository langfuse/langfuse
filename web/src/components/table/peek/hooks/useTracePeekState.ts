import { useCallback } from "react";

export const useTracePeekState = (pathname: string) => {
  const url = new URL(window.location.href);
  const params = new URLSearchParams(url.search);
  const peek = params.get("peek");
  const timestamp = params.get("timestamp");

  const setPeekView = useCallback(
    (open: boolean, id?: string, time?: string) => {
      const url = new URL(window.location.href);
      const params = new URLSearchParams(url.search);
      const peek = params.get("peek");
      const timestamp = params.get("timestamp");

      if (!open || !id) {
        // close peek view
        params.delete("peek");
        params.delete("timestamp");
        params.delete("observation");
        params.delete("display");
      } else if (open && id !== peek) {
        // open or update
        params.set("peek", id);
        const relevantTimestamp = time ?? (timestamp as string);
        if (relevantTimestamp) params.set("timestamp", relevantTimestamp);
        params.delete("observation");
      } else {
        return;
      }

      const newSearch = params.toString();
      const newUrl = pathname + (newSearch ? `?${newSearch}` : "");

      window.history.replaceState(
        {
          ...window.history.state,
          as: newUrl,
          url: newUrl,
        },
        "",
        newUrl,
      );
    },
    // [router, peek, timestamp, pathname]
    [],
  );

  return {
    peekId: peek as string | undefined,
    timestamp: timestamp ? new Date(timestamp as string) : undefined,
    setPeekView,
  };
};
