import { useCallback, useRef } from "react";
import type { UseSidebarFilterStateOptions } from "@/src/features/filters/hooks/useSidebarFilterState";
import type { useTableViewManager } from "./useTableViewManager";

export function useTableViewFilterChange() {
  const viewControllersRef = useRef<Pick<
    ReturnType<typeof useTableViewManager>,
    "handleUserStateChange"
  > | null>(null);

  const onExplicitFilterStateChange = useCallback<
    NonNullable<UseSidebarFilterStateOptions["onExplicitFilterStateChange"]>
  >((change) => {
    if (change.origin !== "user") return;
    viewControllersRef.current?.handleUserStateChange(
      change.previousFilters,
      change.nextFilters,
      { force: change.action === "clear" },
    );
  }, []);

  return { viewControllersRef, onExplicitFilterStateChange };
}
