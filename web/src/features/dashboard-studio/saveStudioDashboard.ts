import { type DashboardDefinition, type FilterState } from "@langfuse/shared";
import { type createStudioStore } from "./studioStore";

export async function saveStudioDashboard({
  store,
  filters,
  saveDefinition,
  saveFilters,
}: {
  store: ReturnType<typeof createStudioStore>;
  filters: FilterState;
  saveDefinition: (definition: DashboardDefinition) => Promise<unknown>;
  saveFilters: (filters: FilterState) => Promise<unknown>;
}) {
  const definition = store.getState().definition;
  await saveDefinition(definition);
  store.getState().actions.markSaved(definition);
  await saveFilters(filters);
  return { definition, filters };
}
