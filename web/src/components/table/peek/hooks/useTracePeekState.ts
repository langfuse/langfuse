import { useRouter } from "next/router";
import { useCallback } from "react";
import { getPathnameWithoutBasePath } from "@/src/utils/api";

export const useTracePeekState = () => {
  const router = useRouter();
  const { peek, timestamp } = router.query;

  const setPeekView = useCallback(
    (open: boolean, id?: string, time?: string) => {
      const url = new URL(window.location.href);
      const params = new URLSearchParams(url.search);
      const pathname = getPathnameWithoutBasePath();

      if (!open || !id) {
        // close peek view
        params.delete("peek");
        params.delete("timestamp");
        params.delete("observation");
        params.delete("display");
      } else if (open && id !== peek) {
        // open peek view or update peek view
        params.set("peek", id);
        const relevantTimestamp = time ?? (timestamp as string);
        if (relevantTimestamp) params.set("timestamp", relevantTimestamp);
        params.delete("observation");
      } else {
        return;
      }

      router.replace(
        {
          pathname,
          query: params.toString(),
        },
        undefined,
        { shallow: true },
      );
    },
    [router, peek, timestamp],
  );

  return {
    peekId: peek as string | undefined,
    timestamp: timestamp ? new Date(timestamp as string) : undefined,
    setPeekView,
  };
};
