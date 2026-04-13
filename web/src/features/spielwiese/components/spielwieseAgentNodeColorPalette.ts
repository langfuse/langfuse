import type { CSSProperties } from "react";

export const spielwieseAgentNodeColorPalette = {
  chromeBorder: "rgba(0,0,0,0.05)",
  detachedUserShellSurface: "rgba(255,255,255,0.96)",
  headerSurface: "rgba(251,251,251,0.82)",
  headerSurfaceBackdrop: "rgba(251,251,251,0.72)",
  promptFrameSurface: "#F1F2F2",
  promptValueBorder: "rgba(0,0,0,0.04)",
  promptValueSurface: "#FBFBFB",
  shellBorder: "rgba(15,23,42,0.08)",
  shellShadow: "rgba(15,23,42,0.04)",
  shellSurface: "#F1F2F2",
  textFieldHalo: "rgba(0,0,0,0.03)",
  textFieldSurface: "#FFFFFF",
} as const;

export const spielwieseCanvasLayerPalette = {
  pane: "#FCFCFD",
  paneShell: "#FCFCFD",
  paneSurface: "#FFFFFF",
} as const;

export const spielwieseMessageSectionChipPaddingDefaults = {
  bottom: 0,
  left: 0,
  right: 0,
  top: 2,
} as const;

export type SpielwieseAgentNodeColorKey =
  keyof typeof spielwieseAgentNodeColorPalette;

export type SpielwieseAgentNodeColorState = Record<
  SpielwieseAgentNodeColorKey,
  string
>;

export type SpielwieseCanvasLayerKey =
  keyof typeof spielwieseCanvasLayerPalette;

export type SpielwieseCanvasLayerState = Record<
  SpielwieseCanvasLayerKey,
  string
>;

export const spielwieseAgentNodeChromeSettings = {
  showHeaderDivider: false,
  useHeaderBlur: false,
} as const;

export type SpielwieseAgentNodeChromeSettingKey =
  keyof typeof spielwieseAgentNodeChromeSettings;

export type SpielwieseAgentNodeChromeSettingsState = Record<
  SpielwieseAgentNodeChromeSettingKey,
  boolean
>;

function getDebugColorOverrideValue(
  cssVariable: `--${string}`,
  fallbackValue: string,
) {
  return `var(${cssVariable}, ${fallbackValue})`;
}

export function getSpielwieseAgentNodeColorVariableStyle(
  colors: SpielwieseAgentNodeColorState,
): CSSProperties {
  return {
    "--spielwiese-dashboard-agent-node-chrome-border": colors.chromeBorder,
    "--spielwiese-dashboard-agent-node-detached-user-shell-surface":
      colors.detachedUserShellSurface,
    "--spielwiese-dashboard-agent-node-header-surface": colors.headerSurface,
    "--spielwiese-dashboard-agent-node-header-surface-backdrop":
      colors.headerSurfaceBackdrop,
    "--spielwiese-dashboard-agent-node-prompt-frame-surface":
      colors.promptFrameSurface,
    "--spielwiese-dashboard-agent-node-prompt-value-border":
      colors.promptValueBorder,
    "--spielwiese-dashboard-agent-node-prompt-value-surface":
      colors.promptValueSurface,
    "--spielwiese-dashboard-agent-node-shell-border": colors.shellBorder,
    "--spielwiese-dashboard-agent-node-shell-shadow": colors.shellShadow,
    "--spielwiese-dashboard-agent-node-shell-surface": colors.shellSurface,
    "--spielwiese-dashboard-agent-node-text-field-halo": colors.textFieldHalo,
    "--spielwiese-dashboard-agent-node-text-field-surface":
      colors.textFieldSurface,
  } as CSSProperties;
}

export function getSpielwieseCanvasLayerVariableStyle({
  colors,
  highlightedLayer,
}: {
  colors: SpielwieseCanvasLayerState;
  highlightedLayer: SpielwieseCanvasLayerKey | null;
}): CSSProperties {
  return {
    "--spielwiese-dashboard-canvas-pane-background": colors.pane,
    "--spielwiese-dashboard-canvas-pane-shell-background": colors.paneShell,
    "--spielwiese-dashboard-canvas-pane-surface-background": colors.paneSurface,
    "--spielwiese-dashboard-canvas-pane-outline":
      highlightedLayer === "pane" ? "rgba(236, 101, 58, 0.9)" : "transparent",
    "--spielwiese-dashboard-canvas-pane-shell-outline":
      highlightedLayer === "paneShell"
        ? "rgba(65, 105, 225, 0.9)"
        : "transparent",
    "--spielwiese-dashboard-canvas-pane-surface-outline":
      highlightedLayer === "paneSurface"
        ? "rgba(16, 163, 127, 0.92)"
        : "transparent",
  } as CSSProperties;
}

export function getSpielwieseAgentNodeChromeVariableStyle({
  colors,
  settings,
}: {
  colors: SpielwieseAgentNodeColorState;
  settings: SpielwieseAgentNodeChromeSettingsState;
}): CSSProperties {
  return {
    "--spielwiese-dashboard-agent-node-header-active-surface":
      settings.useHeaderBlur
        ? colors.headerSurfaceBackdrop
        : colors.headerSurface,
    "--spielwiese-dashboard-agent-node-header-backdrop-filter":
      settings.useHeaderBlur ? "blur(12px)" : "none",
    "--spielwiese-dashboard-agent-node-header-divider":
      settings.showHeaderDivider ? colors.chromeBorder : "transparent",
  } as CSSProperties;
}

export function getSpielwieseMessageSectionChipVariableStyle({
  bottom,
  left,
  right,
  top,
}: {
  bottom: number;
  left: number;
  right: number;
  top: number;
}): CSSProperties {
  return {
    "--spielwiese-dashboard-message-section-chip-padding-bottom": `${bottom}px`,
    "--spielwiese-dashboard-message-section-chip-padding-left": `${left}px`,
    "--spielwiese-dashboard-message-section-chip-padding-right": `${right}px`,
    "--spielwiese-dashboard-message-section-chip-padding-top": `${top}px`,
  } as CSSProperties;
}

export const spielwieseMessageSectionChipVariableStyle = {
  "--spielwiese-message-section-chip-padding-bottom":
    getDebugColorOverrideValue(
      "--spielwiese-dashboard-message-section-chip-padding-bottom",
      `${spielwieseMessageSectionChipPaddingDefaults.bottom}px`,
    ),
  "--spielwiese-message-section-chip-padding-left": getDebugColorOverrideValue(
    "--spielwiese-dashboard-message-section-chip-padding-left",
    `${spielwieseMessageSectionChipPaddingDefaults.left}px`,
  ),
  "--spielwiese-message-section-chip-padding-right": getDebugColorOverrideValue(
    "--spielwiese-dashboard-message-section-chip-padding-right",
    `${spielwieseMessageSectionChipPaddingDefaults.right}px`,
  ),
  "--spielwiese-message-section-chip-padding-top": getDebugColorOverrideValue(
    "--spielwiese-dashboard-message-section-chip-padding-top",
    `${spielwieseMessageSectionChipPaddingDefaults.top}px`,
  ),
} as CSSProperties;

export const spielwieseMessageSectionChipPaddingStyle = {
  paddingBottom: "var(--spielwiese-message-section-chip-padding-bottom)",
  paddingLeft: "var(--spielwiese-message-section-chip-padding-left)",
  paddingRight: "var(--spielwiese-message-section-chip-padding-right)",
  paddingTop: "var(--spielwiese-message-section-chip-padding-top)",
} as CSSProperties;

export const spielwieseAgentNodeColorVariableStyle = {
  ...spielwieseMessageSectionChipVariableStyle,
  "--spielwiese-canvas-pane-background": getDebugColorOverrideValue(
    "--spielwiese-dashboard-canvas-pane-background",
    spielwieseCanvasLayerPalette.pane,
  ),
  "--spielwiese-canvas-pane-shell-background": getDebugColorOverrideValue(
    "--spielwiese-dashboard-canvas-pane-shell-background",
    spielwieseCanvasLayerPalette.paneShell,
  ),
  "--spielwiese-canvas-pane-surface-background": getDebugColorOverrideValue(
    "--spielwiese-dashboard-canvas-pane-surface-background",
    spielwieseCanvasLayerPalette.paneSurface,
  ),
  "--spielwiese-canvas-pane-outline": getDebugColorOverrideValue(
    "--spielwiese-dashboard-canvas-pane-outline",
    "transparent",
  ),
  "--spielwiese-canvas-pane-shell-outline": getDebugColorOverrideValue(
    "--spielwiese-dashboard-canvas-pane-shell-outline",
    "transparent",
  ),
  "--spielwiese-canvas-pane-surface-outline": getDebugColorOverrideValue(
    "--spielwiese-dashboard-canvas-pane-surface-outline",
    "transparent",
  ),
  "--spielwiese-agent-node-chrome-border": getDebugColorOverrideValue(
    "--spielwiese-dashboard-agent-node-chrome-border",
    spielwieseAgentNodeColorPalette.chromeBorder,
  ),
  "--spielwiese-agent-node-header-surface": getDebugColorOverrideValue(
    "--spielwiese-dashboard-agent-node-header-surface",
    spielwieseAgentNodeColorPalette.headerSurface,
  ),
  "--spielwiese-agent-node-header-surface-backdrop": getDebugColorOverrideValue(
    "--spielwiese-dashboard-agent-node-header-surface-backdrop",
    spielwieseAgentNodeColorPalette.headerSurfaceBackdrop,
  ),
  "--spielwiese-agent-node-header-active-surface": getDebugColorOverrideValue(
    "--spielwiese-dashboard-agent-node-header-active-surface",
    spielwieseAgentNodeColorPalette.headerSurface,
  ),
  "--spielwiese-agent-node-header-backdrop-filter": getDebugColorOverrideValue(
    "--spielwiese-dashboard-agent-node-header-backdrop-filter",
    "none",
  ),
  "--spielwiese-agent-node-header-divider": getDebugColorOverrideValue(
    "--spielwiese-dashboard-agent-node-header-divider",
    "transparent",
  ),
  "--spielwiese-agent-node-prompt-frame-surface": getDebugColorOverrideValue(
    "--spielwiese-dashboard-agent-node-prompt-frame-surface",
    spielwieseAgentNodeColorPalette.promptFrameSurface,
  ),
  "--spielwiese-agent-node-prompt-value-border": getDebugColorOverrideValue(
    "--spielwiese-dashboard-agent-node-prompt-value-border",
    spielwieseAgentNodeColorPalette.promptValueBorder,
  ),
  "--spielwiese-agent-node-prompt-value-surface": getDebugColorOverrideValue(
    "--spielwiese-dashboard-agent-node-prompt-value-surface",
    spielwieseAgentNodeColorPalette.promptValueSurface,
  ),
  "--spielwiese-agent-node-shell-border": getDebugColorOverrideValue(
    "--spielwiese-dashboard-agent-node-shell-border",
    spielwieseAgentNodeColorPalette.shellBorder,
  ),
  "--spielwiese-agent-node-shell-shadow": getDebugColorOverrideValue(
    "--spielwiese-dashboard-agent-node-shell-shadow",
    spielwieseAgentNodeColorPalette.shellShadow,
  ),
  "--spielwiese-agent-node-shell-surface": getDebugColorOverrideValue(
    "--spielwiese-dashboard-agent-node-shell-surface",
    spielwieseAgentNodeColorPalette.shellSurface,
  ),
  "--spielwiese-agent-node-text-field-halo": getDebugColorOverrideValue(
    "--spielwiese-dashboard-agent-node-text-field-halo",
    spielwieseAgentNodeColorPalette.textFieldHalo,
  ),
  "--spielwiese-agent-node-text-field-surface": getDebugColorOverrideValue(
    "--spielwiese-dashboard-agent-node-text-field-surface",
    spielwieseAgentNodeColorPalette.textFieldSurface,
  ),
} as CSSProperties;

export const spielwieseAgentNodeHeaderSurfaceStyle = {
  WebkitBackdropFilter: "var(--spielwiese-agent-node-header-backdrop-filter)",
  backdropFilter: "var(--spielwiese-agent-node-header-backdrop-filter)",
} as CSSProperties;

export const spielwieseDetachedUserShellSurfaceStyle = {
  backgroundColor: getDebugColorOverrideValue(
    "--spielwiese-dashboard-agent-node-detached-user-shell-surface",
    spielwieseAgentNodeColorPalette.detachedUserShellSurface,
  ),
} as CSSProperties;
