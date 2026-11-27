import type { McpFeatureModule } from "../tools";
import { getMediaTool, handleGetMedia } from "./tools/getMedia";

export const mediaFeature = {
  name: "media",
  description:
    "Retrieve files, images, audio, video, text, and other media assets in the current Langfuse project",
  tools: [
    {
      definition: getMediaTool,
      handler: handleGetMedia,
    },
  ],
} as const satisfies McpFeatureModule;
