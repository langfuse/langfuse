import { type NotebookDocumentWidth } from "../../schema";

type DocumentIndexEntry = {
  documentId: string;
  contentHash: string;
  width: NotebookDocumentWidth;
};

export function getDirtyDocumentIds(
  staged: readonly DocumentIndexEntry[],
  published: readonly DocumentIndexEntry[],
) {
  const previousDocuments = new Map(
    published.map((document) => [document.documentId, document]),
  );
  const dirty = new Set<string>();
  for (const document of staged) {
    const previous = previousDocuments.get(document.documentId);
    if (
      !previous ||
      previous.contentHash !== document.contentHash ||
      previous.width !== document.width
    ) {
      dirty.add(document.documentId);
    }
    previousDocuments.delete(document.documentId);
  }
  for (const documentId of previousDocuments.keys()) dirty.add(documentId);
  return dirty;
}
