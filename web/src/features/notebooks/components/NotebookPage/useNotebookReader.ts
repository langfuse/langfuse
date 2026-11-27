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
    refetchInterval: (query) =>
      input.version === undefined && query.state.data?.isDraft ? 3000 : false,
    meta: { silentAllErrors: true },
    select: ({
      config: { layout, bindings },
      document: { id: documentId, ...document },
      ...notebook
    }) => ({
      ...notebook,
      ...document,
      documentId,
      layout: { ...layout, bindings },
    }),
  });
  function onDocumentChange(documentId: string | null) {
    return router.push(
      buildNotebookPath({
        projectId,
        notebookId,
        documentId: documentId ?? undefined,
        version: input.version,
      }),
    );
  }

  function onVersionChange(version: number | null) {
    // Other documents may not exist in the selected version.
    return router.push(buildNotebookPath({ projectId, notebookId, version }));
  }

  return { notebook, onDocumentChange, onVersionChange };
}
