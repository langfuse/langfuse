import { z } from "zod";
import {
  notebookDocumentId,
  notebookVersion,
} from "@/src/features/notebooks/schema";
import { readDocument } from "@/src/features/notebooks/server/notebookService";
import { defineHaloOnlyTool } from "../../../core/define-halo-only-tool";

const notebookId = notebookDocumentId;

const documentId = notebookDocumentId
  .optional()
  .describe("ID of the document. Defaults to main.");

const readDocumentSchema = z.object({
  notebookId,
  documentId,
  version: notebookVersion.optional(),
  revision: notebookVersion.optional(),
  staged: z
    .boolean()
    .optional()
    .describe("Read the staged draft instead. Defaults to false."),
});

export const [readDocumentTool, handleReadDocument] = defineHaloOnlyTool({
  name: "read_document",
  action: "notebooks:read",
  spanName: "mcp.notebooks.read_document",
  readOnlyHint: true,
  description:
    "Read a document from the latest published notebook version by default. Pass version for a published version, revision for an edit checkpoint, or staged: true for the current draft.",
  baseSchema: readDocumentSchema,
  inputSchema: readDocumentSchema.refine(
    ({ version, revision, staged }) =>
      [version !== undefined, revision !== undefined, staged === true].filter(
        Boolean,
      ).length <= 1,
    { message: "Choose a draft, published version, or revision." },
  ),
  handler: async (input, context) => {
    const { versions, ...document } = await readDocument({
      ...input,
      projectId: context.projectId,
    });
    return { ...document, versions: versions.map(({ number }) => number) };
  },
});
