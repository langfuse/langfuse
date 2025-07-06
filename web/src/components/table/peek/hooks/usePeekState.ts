import { useRouter } from "next/router";
import { useCallback } from "react";
import { getPathnameWithoutBasePath } from "@/src/utils/api";

export const usePeekState = () => {
  const router = useRouter();
  const { peek } = router.query;

  const setPeekView = useCallback(
    (open: boolean, id?: string) => {
      const url = new URL(window.location.href);
      const params = new URLSearchParams(url.search);
      const pathname = getPathnameWithoutBasePath();

      if (!open || !id) {
        // close peek view
        params.delete("peek");
      } else if (open && id !== peek) {
        // open peek view or update peek view
        params.set("peek", id);
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
    [router, peek],
  );

  return {
    peekId: peek as string | undefined,
    setPeekView,
  };
};
