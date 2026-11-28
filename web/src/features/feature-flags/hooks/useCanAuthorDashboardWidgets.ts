import { useSession } from "next-auth/react";
import { canAuthorDashboardBlocks } from "../utils";

export function useCanAuthorDashboardWidgets() {
  const { data: session } = useSession();
  return canAuthorDashboardBlocks(session);
}
