import {
  ComponentTextColor,
  ComponentTextSize,
  ComponentSpacerSize,
  ComponentDividerSpacingSize,
  type EventComponentInput,
} from "@team-plain/typescript-sdk";

/**
 * Input for the Support Request Metadata event UI.
 * Compact layout using Text/PlainText, markdown links, small muted labels,
 * minimal spacers, and copy buttons under values.
 */
export type SupportRequestMetadataInput = {
  userEmail?: string;
  url?: string;
  organizationId?: string;
  projectId?: string;
  version?: string;
  plan?: string;
  cloudRegion?: string;
  browserMetadata?: unknown; // JSON.stringified if provided
};

/**
 * Builds a Plain thread event:
 * - title
 * - compact components (ditch rows, use markdown link, copy buttons)
 */
export function buildPlainEventSupportRequestMetadataComponents(
  input: SupportRequestMetadataInput,
): { title: string; components: EventComponentInput[] } {
  const components: EventComponentInput[] = [];

  // Helpers (avoid null props)
  const pushText = (
    text: string,
    size?: ComponentTextSize,
    color?: ComponentTextColor,
  ) => {
    const payload: Record<string, unknown> = { text };
    if (size) payload.textSize = size;
    if (color) payload.textColor = color;
    components.push({ componentText: payload as any });
  };
  const pushLabel = (text: string) =>
    pushText(text, ComponentTextSize.S, ComponentTextColor.Muted);
  const pushPlain = (plainText: string) =>
    components.push({ componentPlainText: { plainText } });
  const pushSpacer = (size: ComponentSpacerSize) =>
    components.push({ componentSpacer: { spacerSize: size } });
  const pushDivider = (size: ComponentDividerSpacingSize) =>
    components.push({ componentDivider: { dividerSpacingSize: size } });

  // ---------- Header (compact, link in markdown) ----------
  const url = input.url;
  const urlMd = url ? `[${url}](${url})` : undefined;
  const headline = url
    ? `In-app support request submitted on ${urlMd} from [${input.userEmail}](mailto:${input.userEmail})`
    : `In-app support request submitted from [${input.userEmail}](mailto:${input.userEmail})`;
  pushText(headline);
  pushDivider(ComponentDividerSpacingSize.S);

  // ---------- Identifiers ----------
  if (input.organizationId || input.projectId) {
    pushLabel("Identifiers");
    pushText(
      `Organization: ${input.organizationId ?? "—"}  |  Project: ${
        input.projectId ?? "—"
      }`,
    );
  }

  // ---------- Environment  ----------
  if (input.version || input.plan || input.cloudRegion) {
    pushLabel("Environment");
    const parts: string[] = [];
    if (input.plan) parts.push(`Plan: ${input.plan}`);
    if (input.cloudRegion) parts.push(`Cloud Region: ${input.cloudRegion}`);
    if (input.version) parts.push(`Version: ${input.version}`);
    pushPlain(parts.join("  |  "));
    pushSpacer(ComponentSpacerSize.Xs);
  }

  // ---------- Browser ----------
  if (typeof input.browserMetadata !== "undefined") {
    pushLabel("Browser");
    const json =
      typeof input.browserMetadata === "string"
        ? input.browserMetadata
        : JSON.stringify(input.browserMetadata);
    pushPlain(json);
  }

  // Fallback if nothing provided
  if (components.length === 0) {
    pushText("No metadata provided.", undefined, ComponentTextColor.Muted);
  } else {
    pushDivider(ComponentDividerSpacingSize.S);
  }

  return {
    title: "Page context on submit:",
    components,
  };
}
