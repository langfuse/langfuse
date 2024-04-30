import { useRouter } from "next/router";
import { useMemo } from 'react';

export default function useTableNameFromURL(segmentIndex: number = 3) {
  const router = useRouter();

  // Use useMemo to prevent unnecessary recalculations of the table name
  const tableName = useMemo(() => {
    const pathSegments = router.route.split("/");
    if (pathSegments.length > segmentIndex && segmentIndex >= 0) {
      return pathSegments[segmentIndex];
    } else {
      // Handle cases where the segment does not exist
      console.error("The URL does not contain enough segments to extract a table name.");
      return undefined;
    }
  }, [router.route, segmentIndex]);

  return tableName;
}