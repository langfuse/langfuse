import {
  Maximize,
  PanelLeft,
  PanelRight,
  PictureInPicture2,
  type IconComponent,
} from "@langfuse/icons";

/** Where the Halo window sits relative to the page content. */
export const IN_APP_AGENT_LAYOUT_MODES = [
  "full",
  "dock-right",
  "dock-left",
  "floating",
] as const;

export type InAppAgentLayoutMode = (typeof IN_APP_AGENT_LAYOUT_MODES)[number];

export type InAppAgentDockLayoutMode = Extract<
  InAppAgentLayoutMode,
  "dock-right" | "dock-left"
>;

export const IN_APP_AGENT_DEFAULT_LAYOUT_MODE: InAppAgentDockLayoutMode =
  "dock-right";

export function isInAppAgentDockLayoutMode(
  value: unknown,
): value is InAppAgentDockLayoutMode {
  return value === "dock-right" || value === "dock-left";
}

export const IN_APP_AGENT_LAYOUT_MODE_OPTIONS: Record<
  InAppAgentLayoutMode,
  { label: string; icon: IconComponent }
> = {
  full: { label: "Full page", icon: Maximize },
  "dock-right": { label: "Dock right", icon: PanelRight },
  "dock-left": { label: "Dock left", icon: PanelLeft },
  floating: { label: "Floating", icon: PictureInPicture2 },
};

export function parseInAppAgentLayoutMode(
  value: unknown,
): InAppAgentLayoutMode {
  return (
    IN_APP_AGENT_LAYOUT_MODES.find((mode) => mode === value) ??
    IN_APP_AGENT_DEFAULT_LAYOUT_MODE
  );
}
