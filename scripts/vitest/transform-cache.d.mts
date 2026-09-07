export function ciVitestCache(packageName: "web" | "worker" | "shared"):
  | {
      fsModuleCache: true;
      fsModuleCachePath: string;
    }
  | undefined;
