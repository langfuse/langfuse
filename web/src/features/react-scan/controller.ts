export const REACT_SCAN_STORAGE_KEY = "react-scan-enabled";

let reactScanModulePromise: Promise<{ scan: (options?: unknown) => void }> | null = null;

function loadReactScan(): Promise<{ scan: (options?: unknown) => void }> {
  if (reactScanModulePromise) return reactScanModulePromise;
  if (typeof window === "undefined") {
    // SSR safe: never attempt to import on server
    reactScanModulePromise = Promise.reject(new Error("react-scan cannot be loaded on server"));
    return reactScanModulePromise;
  }
  reactScanModulePromise = import("react-scan").then((mod: any) => {
    // Support both ESM and CJS style default/named exports
    const scanExport = mod?.scan ?? mod?.default?.scan ?? mod?.default ?? mod;
    if (typeof scanExport !== "function") {
      throw new Error("react-scan scan() function not found in module export");
    }
    return { scan: scanExport as (options?: unknown) => void };
  });
  return reactScanModulePromise;
}

export function getPersistedReactScanEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(REACT_SCAN_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function persistReactScanEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(REACT_SCAN_STORAGE_KEY, enabled ? "true" : "false");
  } catch {
    // ignore
  }
}

export async function enableReactScan(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const { scan } = await loadReactScan();
    scan({ enabled: true, showToolbar: true });
    persistReactScanEnabled(true);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("Failed to enable react-scan:", err);
  }
}

export async function disableReactScan(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    // If module never loaded, just persist disabled and return
    if (!reactScanModulePromise) {
      persistReactScanEnabled(false);
      return;
    }
    const { scan } = await loadReactScan();
    scan({ enabled: false, showToolbar: false });
    persistReactScanEnabled(false);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("Failed to disable react-scan:", err);
  }
}