import { DashboardDefinitionSchema } from "@langfuse/shared";
import { type StudioPlacement } from "./StudioPlacementCard";

export function serializeStudioPlacement(placement: StudioPlacement) {
  return JSON.stringify({
    type: "langfuse-studio-placement",
    version: 1,
    placement,
  });
}

export function parseStudioPlacement(text: string): StudioPlacement | null {
  try {
    const envelope: unknown = JSON.parse(text);
    if (
      !envelope ||
      typeof envelope !== "object" ||
      !("type" in envelope) ||
      envelope.type !== "langfuse-studio-placement" ||
      !("version" in envelope) ||
      envelope.version !== 1 ||
      !("placement" in envelope)
    )
      return null;
    const result = DashboardDefinitionSchema.safeParse({
      widgets: [envelope.placement],
    });
    const placement = result.success ? result.data.widgets[0] : undefined;
    return placement?.type === "query" || placement?.type === "text"
      ? placement
      : null;
  } catch {
    return null;
  }
}
