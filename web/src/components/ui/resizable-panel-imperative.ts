import type { PanelImperativeHandle } from "react-resizable-panels";

/**
 * react-resizable-panels' imperative API looks the group up in a module-level
 * registry. After the group unmounts — desktop↔mobile swap, navigation, or a
 * remount that tears the group down — the panel ref still holds the live
 * methods, and isCollapsed / expand / collapse / resize / getSize throw.
 */
export function isUnmountedResizablePanelGroupError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  // Same "Group … not found" shape as the registry miss, but this one means a
  // Panel rendered outside a Group — still an application bug.
  if (error.message === "Group Context not found") return false;
  return (
    /^Group \S+ not found$/.test(error.message) ||
    /^Could not find (?:data for )?Group with id /.test(error.message)
  );
}

/**
 * Run an imperative panel call, treating a missing group as "the panel is
 * already gone" rather than an application error.
 */
export function withMountedPanel<T>(
  panel: PanelImperativeHandle | null | undefined,
  fn: (panel: PanelImperativeHandle) => T,
  fallback: T,
): T {
  if (!panel) return fallback;
  try {
    return fn(panel);
  } catch (error) {
    if (isUnmountedResizablePanelGroupError(error)) return fallback;
    throw error;
  }
}
