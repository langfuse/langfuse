import type { McpFeatureModule } from "../../server/registry";
import { getMediaTool, handleGetMedia } from "./tools/getMedia";

export const mediaFeature: McpFeatureModule = {
  name: "media",
  description:
    "Retrieve files, images, audio, video, text, and other media assets in the current Langfuse project",
  tools: [
    {
      definition: getMediaTool,
      handler: handleGetMedia,
      allowInAppAgentKey: true,
    },
  ],
};
