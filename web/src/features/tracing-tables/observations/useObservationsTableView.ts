import { useLayoutEffect, useState } from "react";
import { useSelectAll } from "@/src/features/table/hooks/useSelectAll";
import {
  createObservationsTableStore,
  type ObservationsTableStore,
} from "@/src/features/tracing-tables/observations/observationsTableStore";

export function useObservationsTableView({
  projectId,
}: {
  projectId: string;
}): { store: ObservationsTableStore } {
  const { selectAll, setSelectAll } = useSelectAll(projectId, "observations");
  const [store] = useState(() =>
    createObservationsTableStore({
      initialSelectAll: selectAll,
      onSelectAllChange: setSelectAll,
    }),
  );

  // Layout effect so a selectAll reset (e.g. route change) reaches
  // store-subscribed rows before paint — no one-frame stale highlight.
  useLayoutEffect(() => {
    store.getState().actions.syncSelectAll(selectAll);
  }, [selectAll, store]);

  return { store };
}
