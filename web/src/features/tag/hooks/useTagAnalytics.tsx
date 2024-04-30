import { usePostHog } from "posthog-js/react";
import useTableNameFromURL from "@/src/hooks/useTableNameFromURL";

export function useTagAnalytics() {
  const posthog = usePostHog();
  const tableName = useTableNameFromURL(3);

  // Determine the 'type' based on the 4th URL segment. If it exists, set 'type' to "Detail View", otherwise set it to "table".
  const type = useTableNameFromURL(4) ? "Detail View" : "table";

  return { posthog, tableName, type };
}
