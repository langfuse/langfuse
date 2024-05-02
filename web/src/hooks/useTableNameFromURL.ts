import { useRouter } from "next/router";
import { useMemo } from "react";

export default function useTableNameFromURL(segmentIndex: number = 3) {
  const router = useRouter();

  // Use useMemo to prevent unnecessary recalculations of the table name
  const tableName = useMemo(() => {
    const pathSegments = router.route.split("/");
    if (pathSegments.length > segmentIndex && segmentIndex >= 0) {
      return pathSegments[segmentIndex];
    } else {
      // Handle cases where the segment does not exist
      // (e.g. when we try to determine if the current page is a detail view or not)")
      return undefined;
    }
  }, [router.route, segmentIndex]);

  return tableName;
}
