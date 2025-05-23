import { useRouter } from "next/router";
import { useCallback } from "react";

export const usePeekState = (pathname: string) => {
  const router = useRouter();
  const { peek } = router.query;

  const setPeekView = useCallback(
    (open: boolean, id?: string) => {
      const url = new URL(window.location.href);
      const params = new URLSearchParams(url.search);

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
    [router, pathname, peek],
  );

  return {
    peekId: peek as string | undefined,
    setPeekView,
  };
};
