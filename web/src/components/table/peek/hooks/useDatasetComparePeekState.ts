import { useRouter } from "next/router";
import { useCallback, useState } from "react";
import { getPathnameWithoutBasePath } from "@/src/utils/api";

export const useDatasetComparePeekState = () => {
  const router = useRouter();
  const { peek: datasetItem } = router.query;

  const [selectedRunItemProps, setSelectedRunItemProps] = useState<{
    runId: string;
    traceId: string;
    observationId?: string;
  } | null>(null);

  const setPeekView = useCallback(
    (open: boolean, itemId?: string) => {
      const url = new URL(window.location.href);
      const params = new URLSearchParams(url.search);
      const pathname = getPathnameWithoutBasePath();

      if (!open || !itemId) {
        // close peek view
        params.delete("peek");
      } else if (open && itemId !== datasetItem) {
        // open peek view or update peek view
        params.set("peek", itemId);
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
    [router, datasetItem],
  );

  return {
    datasetItemId: datasetItem as string | undefined,
    selectedRunItemProps,
    setSelectedRunItemProps,
    setPeekView,
  };
};
