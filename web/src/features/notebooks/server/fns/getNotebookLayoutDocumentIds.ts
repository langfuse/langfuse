import { MAIN_NOTEBOOK_DOCUMENT, type NotebookLayout } from "../../schema";

export function getNotebookLayoutDocumentIds(layout: NotebookLayout) {
  if (layout.kind === "default") return [MAIN_NOTEBOOK_DOCUMENT];
  return layout.documents.map(({ documentId }) => documentId);
}
