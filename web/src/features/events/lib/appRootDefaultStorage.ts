export {
  useBrowserStorageValue,
  writeStorage,
} from "@/src/utils/browserStorage";

export const appRootPreferenceStorageKey = (projectId: string) =>
  `events-filter-app-root-default:${projectId}`;
export const appRootSavedViewSessionStorageKey = (projectId: string) =>
  `observations-events-${projectId}-viewId`;
