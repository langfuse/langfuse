import type { McpFeatureModule } from "../registry";
import { listNotebooksTool, handleListNotebooks } from "./tools/listNotebooks";
import { getNotebookTool, handleGetNotebook } from "./tools/getNotebook";
import {
  createNotebookTool,
  handleCreateNotebook,
} from "./tools/createNotebook";
import {
  validateNotebookTool,
  handleValidateNotebook,
} from "./tools/validateNotebook";
import {
  publishNotebookTool,
  handlePublishNotebook,
} from "./tools/publishNotebook";
import { readDocumentTool, handleReadDocument } from "./tools/readDocument";
import { writeDocumentTool, handleWriteDocument } from "./tools/writeDocument";
import { patchDocumentTool, handlePatchDocument } from "./tools/patchDocument";
import {
  updateNotebookLayoutTool,
  handleUpdateNotebookLayout,
} from "./tools/updateNotebookLayout";

export const notebooksFeature = {
  name: "notebooks",
  description: "Read, stage, validate, and publish versioned notebooks.",
  isEnabled: (context) => {
    const principal = context.auth?.principal;
    return (
      principal?.kind === "apiKey" &&
      principal.isInAppAgentKey &&
      context.inAppAgent !== undefined
    );
  },
  tools: [
    { definition: listNotebooksTool, handler: handleListNotebooks },
    { definition: getNotebookTool, handler: handleGetNotebook },
    { definition: createNotebookTool, handler: handleCreateNotebook },
    { definition: validateNotebookTool, handler: handleValidateNotebook },
    { definition: publishNotebookTool, handler: handlePublishNotebook },
    { definition: readDocumentTool, handler: handleReadDocument },
    { definition: writeDocumentTool, handler: handleWriteDocument },
    { definition: patchDocumentTool, handler: handlePatchDocument },
    {
      definition: updateNotebookLayoutTool,
      handler: handleUpdateNotebookLayout,
    },
  ],
} as const satisfies McpFeatureModule;
