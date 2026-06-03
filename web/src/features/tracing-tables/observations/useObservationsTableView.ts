import { useEffect, useState } from "react";
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

  useEffect(() => {
    store.getState().actions.syncSelectAll(selectAll);
  }, [selectAll, store]);

  return { store };
}
