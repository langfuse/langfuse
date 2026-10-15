import { DETAIL_TABS, type DetailTab } from "../constants/detailTabs";

export function getDetailTabs({
  target,
  isV4,
  internalFeaturesEnabled,
  isAnnotationMode,
  hasObservations,
  canViewScores,
}: {
  target: "trace" | "observation";
  isV4: boolean;
  internalFeaturesEnabled: boolean;
  isAnnotationMode: boolean;
  hasObservations: boolean;
  canViewScores: boolean;
}) {
  const visibility: Record<DetailTab, boolean> = {
    preview: true,
    messages: isV4 && internalFeaturesEnabled,
    attributes: true,
    scores: canViewScores && !isAnnotationMode,
    log: (target === "trace" || isV4) && hasObservations && !isAnnotationMode,
  };
  return DETAIL_TABS.filter((tab) => visibility[tab]);
}
