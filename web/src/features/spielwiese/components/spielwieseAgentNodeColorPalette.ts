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

export type SpielwieseAgentNodeColorKey =
  keyof typeof spielwieseAgentNodeColorPalette;

export type SpielwieseAgentNodeColorState = Record<
  SpielwieseAgentNodeColorKey,
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

type SpielwieseAgentNodeColorHudItem = {
  id: string;
  key: SpielwieseAgentNodeColorKey;
  label: string;
};

type SpielwieseAgentNodeChromeHudItem = {
  description: string;
  key: SpielwieseAgentNodeChromeSettingKey;
  label: string;
};

export const spielwieseAgentNodeColorHudSections = [
  {
    id: "shell",
    items: [
      {
        id: "shell-surface",
        key: "shellSurface",
        label: "Shell Surface",
      },
      {
        id: "shell-border",
        key: "shellBorder",
        label: "Shell Border",
      },
      {
        id: "shell-shadow",
        key: "shellShadow",
        label: "Shell Shadow",
      },
    ],
    title: "Shell",
  },
  {
    id: "header",
    items: [
      {
        id: "header-surface",
        key: "headerSurface",
        label: "Header Surface",
      },
      {
        id: "header-surface-backdrop",
        key: "headerSurfaceBackdrop",
        label: "Header Blur Surface",
      },
      {
        id: "chrome-border",
        key: "chromeBorder",
        label: "Chrome Border",
      },
    ],
    title: "Header",
  },
  {
    id: "prompt",
    items: [
      {
        id: "prompt-frame-surface",
        key: "promptFrameSurface",
        label: "Prompt Frame",
      },
      {
        id: "prompt-value-surface",
        key: "promptValueSurface",
        label: "Prompt Value",
      },
      {
        id: "prompt-value-border",
        key: "promptValueBorder",
        label: "Prompt Inset Border",
      },
      {
        id: "text-field-surface",
        key: "textFieldSurface",
        label: "Text Field",
      },
      {
        id: "text-field-halo",
        key: "textFieldHalo",
        label: "Text Field Halo",
      },
      {
        id: "detached-user-shell-surface",
        key: "detachedUserShellSurface",
        label: "Detached User Shell",
      },
    ],
    title: "Prompt",
  },
] as const satisfies ReadonlyArray<{
  id: string;
  items: readonly SpielwieseAgentNodeColorHudItem[];
  title: string;
}>;

export const spielwieseAgentNodeChromeHudItems = [
  {
    description: "Keep the agent header flat like the other nodes",
    key: "useHeaderBlur",
    label: "Header Blur",
  },
  {
    description: "Show the internal divider through the agent header",
    key: "showHeaderDivider",
    label: "Header Divider",
  },
] as const satisfies readonly SpielwieseAgentNodeChromeHudItem[];

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

export const spielwieseAgentNodeColorVariableStyle = {
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
