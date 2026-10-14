import { type DetailTab } from "../constants/detailTabs";

export function resolveDetailTab(tab: DetailTab, tabs: readonly DetailTab[]) {
  return tabs.includes(tab) ? tab : "preview";
}
