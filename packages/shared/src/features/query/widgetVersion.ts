import { requiresV2 } from "./dataModel";
import {
  persistedWidgetViewToQueryView,
  viewsV2,
  type ViewVersion,
} from "./types";

export type WidgetQueryVersion = 1 | 2;
export type WidgetQueryShape = Parameters<typeof requiresV2>[0];

/**
 * Returns the lowest query-engine version required by a widget definition.
 * This is shape classification only; persistence policy remains owned by
 * DashboardService.
 */
export function getWidgetRequiredVersion(
  shape: WidgetQueryShape,
): WidgetQueryVersion {
  return requiresV2(shape) ? 2 : 1;
}

/**
 * Whether a widget view may be *offered* for a target version. v2 derives
 * traces at read time from the events model, so `viewsV2` — already the
 * allowlist for new v4 widget definitions — is also the suggestion allowlist.
 * Existing `traces` widgets stay readable (v2 has an events-backed traces
 * declaration); they are just not suggested. (LFE-14444)
 */
export function isSuggestedWidgetView(
  view: string,
  targetVersion: ViewVersion,
): boolean {
  if (targetVersion !== "v2") return true;
  const queryView =
    persistedWidgetViewToQueryView[
      view as keyof typeof persistedWidgetViewToQueryView
    ] ?? view;
  return viewsV2.safeParse(queryView).success;
}

function resolveEffectiveWidgetVersion(params: {
  shape: WidgetQueryShape;
  versionFloor?: number;
  targetVersion: ViewVersion;
}): ViewVersion {
  return getWidgetRequiredVersion(params.shape) >= 2 ||
    (params.versionFloor ?? 1) >= 2 ||
    params.targetVersion === "v2"
    ? "v2"
    : "v1";
}

/**
 * Selects the newest readable query declaration for a persisted widget.
 * This does not decide or mutate the widget's persisted minVersion.
 */
export function resolveWidgetRenderVersion(params: {
  shape: WidgetQueryShape;
  persistedMinVersion?: number;
  newestReadableVersion: ViewVersion;
}): ViewVersion {
  return resolveEffectiveWidgetVersion({
    shape: params.shape,
    versionFloor: params.persistedMinVersion,
    targetVersion: params.newestReadableVersion,
  });
}

/**
 * Selects the declaration used by the widget editor for the active UI mode.
 * The editor's base version is a local floor; saving remains server-owned.
 */
export function resolveWidgetEditorVersion(params: {
  shape: WidgetQueryShape;
  baseMinVersion: number;
  activeVersion: ViewVersion;
}): ViewVersion {
  return resolveEffectiveWidgetVersion({
    shape: params.shape,
    versionFloor: params.baseMinVersion,
    targetVersion: params.activeVersion,
  });
}
