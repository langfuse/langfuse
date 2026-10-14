import { useSyncExternalStore } from "react";

const subscribeToPlatform = () => () => undefined;
const getIsMac = () => navigator.userAgent.includes("Mac");
const getServerIsMac = () => false;

export function useIsMac() {
  return useSyncExternalStore(subscribeToPlatform, getIsMac, getServerIsMac);
}
