import type { McpFeatureModule } from "../../server/registry";
import {
  createCommentTool,
  getCommentTool,
  handleCreateComment,
  handleGetComment,
  handleListComments,
  listCommentsTool,
} from "./tools";

export const commentsFeature: McpFeatureModule = {
  name: "comments",
  description: "Create and inspect comments",
  tools: [
    { definition: createCommentTool, handler: handleCreateComment },
    {
      definition: listCommentsTool,
      handler: handleListComments,
      allowInAppAgentKey: true,
    },
    {
      definition: getCommentTool,
      handler: handleGetComment,
      allowInAppAgentKey: true,
    },
  ],
};
