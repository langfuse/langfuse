import { InvalidRequestError } from "@langfuse/shared";
import { ZodError } from "zod";
import { MAIN_NOTEBOOK_DOCUMENT, type NotebookLayout } from "../../schema";
import { getNotebookLayoutDocumentIds } from "./getNotebookLayoutDocumentIds";
import { parseDocument } from "./parseDocument";

export function collectNotebookValidationErrors(
  documents: readonly { documentId: string; jsonl: string }[],
  layout?: NotebookLayout,
) {
  const errors: { documentId?: string; message: string }[] = [];
  if (layout) {
    const existingIds = new Set(documents.map(({ documentId }) => documentId));
    const referencedIds = new Set(getNotebookLayoutDocumentIds(layout));
    for (const documentId of new Set([
      MAIN_NOTEBOOK_DOCUMENT,
      ...referencedIds,
    ])) {
      if (!existingIds.has(documentId)) {
        errors.push({ documentId, message: "Document does not exist." });
      }
    }
    for (const documentId of existingIds) {
      if (!referencedIds.has(documentId)) {
        errors.push({
          documentId,
          message:
            "The current view hides this document. Show it in the layout before publishing.",
        });
      }
    }
  }
  for (const { documentId, jsonl } of documents) {
    try {
      parseDocument(jsonl, "validate");
    } catch (error) {
      if (!(error instanceof InvalidRequestError || error instanceof ZodError))
        throw error;
      errors.push({ documentId, message: error.message });
    }
  }
  return errors;
}
