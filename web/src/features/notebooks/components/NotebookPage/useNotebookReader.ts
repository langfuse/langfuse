import { buildNotebookPath } from "@langfuse/shared";
import { keepPreviousData } from "@tanstack/react-query";
import { useRouter } from "next/router";

import { api } from "@/src/utils/api";
import { type RouterInput } from "@/src/utils/types";

export function useNotebookReader(input: RouterInput["notebooks"]["view"]) {
  const router = useRouter();
  const { projectId, notebookId } = input;
  const notebook = api.notebooks.view.useQuery(input, {
    placeholderData: keepPreviousData,
    refetchOnMount: "always",
    meta: { silentAllErrors: true },
  });
  function onDocumentChange(documentId: string | null, version: number | null) {
    if (documentId === null) {
      if (version === null && input.draftDocumentId) {
        return router.push(
          `${buildNotebookPath({ projectId, notebookId, draftDocumentId: input.draftDocumentId })}&table=list`,
        );
      }
      return router.push(buildNotebookPath({ projectId, notebookId, version }));
    }
    return router.push(
      version === null
        ? buildNotebookPath({
            projectId,
            notebookId,
            draftDocumentId: documentId,
          })
        : buildNotebookPath({
            projectId,
            notebookId,
            documentId,
            version,
          }),
    );
  }

  function onVersionChange(version: number | null) {
    // Other documents may not exist in the selected version.
    return router.push(buildNotebookPath({ projectId, notebookId, version }));
  }

  return { notebook, onDocumentChange, onVersionChange };
}
