import { createStore } from "zustand/vanilla";
import { type DashboardDefinition } from "@langfuse/shared";
import { findFreeGridPosition } from "@/src/features/widgets/utils/grid-placement";

type Placement = DashboardDefinition["widgets"][number];
type StudioState = {
  definition: DashboardDefinition;
  savedDefinition: DashboardDefinition;
  history: DashboardDefinition[];
  actions: {
    replace: (definition: DashboardDefinition) => void;
    put: (placement: Placement) => void;
    remove: (id: string) => void;
    duplicate: (placement: Placement) => void;
    undo: () => void;
    discard: () => void;
    markSaved: (definition: DashboardDefinition) => void;
  };
};

export function createStudioStore(initialDefinition: DashboardDefinition) {
  return createStore<StudioState>((set, get) => {
    const replace = (definition: DashboardDefinition) => {
      const previous = get().definition;
      if (JSON.stringify(previous) === JSON.stringify(definition)) return;
      set({ definition, history: [...get().history.slice(-19), previous] });
    };
    return {
      definition: initialDefinition,
      savedDefinition: initialDefinition,
      history: [],
      actions: {
        replace,
        put: (placement) => {
          const { definition } = get();
          const exists = definition.widgets.some(
            (item) => item.id === placement.id,
          );
          replace({
            ...definition,
            widgets: exists
              ? definition.widgets.map((item) =>
                  item.id === placement.id ? placement : item,
                )
              : [
                  ...definition.widgets,
                  {
                    ...placement,
                    ...findFreeGridPosition(definition.widgets, placement),
                  },
                ],
          });
        },
        remove: (id) =>
          replace({
            ...get().definition,
            widgets: get().definition.widgets.filter((item) => item.id !== id),
          }),
        duplicate: (placement) => {
          get().actions.put({
            ...placement,
            id: crypto.randomUUID(),
          });
        },
        undo: () => {
          const { history } = get();
          const previous = history[history.length - 1];
          if (previous)
            set({ definition: previous, history: history.slice(0, -1) });
        },
        discard: () => set({ definition: get().savedDefinition, history: [] }),
        markSaved: (definition) => set({ savedDefinition: definition }),
      },
    };
  });
}
