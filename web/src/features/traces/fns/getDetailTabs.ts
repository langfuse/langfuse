import { DETAIL_TABS, type DetailTab } from "../constants/detailTabs";

export function getDetailTabs({
  target,
  isV4,
  isAnnotationMode,
  hasObservations,
  canViewScores,
  hasTopics,
}: {
  target: "trace" | "observation";
  isV4: boolean;
  internalFeaturesEnabled: boolean;
  isAnnotationMode: boolean;
  hasObservations: boolean;
  canViewScores: boolean;
  hasTopics: boolean;
}) {
  const visibility: Record<DetailTab, boolean> = {
    preview: true,
    attributes: true,
    scores: canViewScores && !isAnnotationMode,
    log: (target === "trace" || isV4) && hasObservations && !isAnnotationMode,
    // Topics belong to the trace, so every node of it shows them.
    topics: hasTopics && !isAnnotationMode,
  };
  return DETAIL_TABS.filter((tab) => visibility[tab]);
}
