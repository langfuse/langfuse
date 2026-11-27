import { api as notebookApi } from "@/src/utils/api";
import { buildNotebookPath } from "@langfuse/shared";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { z } from "zod";

import { Badge } from "@/src/components/design-system/Badge/Badge";
import { Button } from "@/src/components/design-system/Button/Button";
import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
import { Spinner } from "@/src/components/design-system/Spinner/Spinner";
import Page from "@/src/components/layouts/Page";
import {
  notebookDocumentId,
  notebookVersion,
} from "@/src/features/notebooks/schema";
import { type RouterInput } from "@/src/utils/types";
import { ConnectedNotebookChart } from "./components/ConnectedNotebookChart/ConnectedNotebookChart";
import { NotebookReader } from "./components/NotebookReader/NotebookReader";
import { ConnectedNotebookEmbed } from "./components/ConnectedNotebookEmbed/ConnectedNotebookEmbed";
import { NotebookVersionHistory } from "./components/NotebookVersionHistory/NotebookVersionHistory";
import { useNotebookReader } from "./useNotebookReader";
import { TablePeekViewTraceDetail } from "@/src/components/table/peek/TablePeekViewTraceDetail";
import { usePeekNavigation } from "@/src/components/table/peek/hooks/usePeekNavigation";
import { useReadPath } from "@/src/features/events/hooks/useReadPath";

const notebookDocumentPath = z.tuple([notebookDocumentId]).optional();

export function NotebookPage() {
  const router = useRouter();
  useEffect(() => {
    if (!router.isReady) return;
    const { documentPath, draftDocument, version } = router.query;
    const projectId = z.string().min(1).safeParse(router.query.projectId);
    const notebookId = notebookDocumentId.safeParse(router.query.notebookId);
    const documentId = notebookDocumentId.safeParse(draftDocument);
    if (
      !documentId.success ||
      !projectId.success ||
      !notebookId.success ||
      documentPath !== undefined ||
      version !== undefined
    )
      return;

    const url = new URL(router.asPath, window.location.origin);
    url.pathname = buildNotebookPath({
      projectId: projectId.data,
      notebookId: notebookId.data,
      documentId: documentId.data,
    });
    url.searchParams.delete("draftDocument");
    void router.replace(`${url.pathname}${url.search}${url.hash}`, undefined, {
      scroll: false,
    });
  }, [router]);
  if (!router.isReady) {
    return (
      <Page headerProps={{ title: "Notebook" }}>
        <div
          className="flex justify-center p-12"
          role="status"
          aria-label="Loading notebook"
        >
          <Spinner size="md" />
        </div>
      </Page>
    );
  }

  const notebookId = notebookDocumentId.safeParse(router.query.notebookId);
  const projectId = z.string().min(1).safeParse(router.query.projectId);
  const documentPath = notebookDocumentPath.safeParse(
    router.query.documentPath,
  );
  const draftDocumentId = notebookDocumentId
    .optional()
    .safeParse(router.query.draftDocument);
  const rawVersion = router.query.version;
  const version = notebookVersion
    .optional()
    .safeParse(
      typeof rawVersion === "string" && /^\d+$/.test(rawVersion)
        ? Number(rawVersion)
        : rawVersion,
    );

  if (
    !projectId.success ||
    !notebookId.success ||
    !documentPath.success ||
    !version.success ||
    !draftDocumentId.success ||
    (draftDocumentId.data && (documentPath.data || version.data))
  ) {
    return (
      <Page headerProps={{ title: "Notebook" }}>
        <p className="p-6 text-sm" role="alert">
          Invalid notebook link.
        </p>
      </Page>
    );
  }

  return (
    <ConnectedNotebookReader
      key={`${projectId.data}/${notebookId.data}`}
      projectId={projectId.data}
      notebookId={notebookId.data}
      documentId={documentPath.data?.[0] ?? draftDocumentId.data}
      version={version.data}
    />
  );
}

function ConnectedNotebookReader({
  projectId,
  notebookId,
  documentId,
  version,
}: RouterInput["notebooks"]["view"]) {
  const router = useRouter();
  const { isV4 } = useReadPath();
  const { closePeek, expandPeek } = usePeekNavigation({
    tableName: "notebook",
    isV4,
    queryParams: ["observation", "timestamp"],
    expandConfig: {
      basePath: `/project/${encodeURIComponent(projectId)}/traces`,
      reader: "trace",
    },
  });
  const [showControlledVariables, setShowControlledVariables] = useState(false);
  const { notebook, onDocumentChange, onVersionChange } = useNotebookReader({
    projectId,
    notebookId,
    documentId,
    version,
  });
  const executeAction = notebookApi.notebooks.executeAction.useMutation();
  const view = notebook.data;
  const title = view?.title || "Notebook";
  const versionHistory = view && (
    <NotebookVersionHistory view={view} onVersionChange={onVersionChange} />
  );
  const headerActions = (
    <>
      {view?.layout.bindings?.some(({ kind }) => kind === "write") && (
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox
            checked={showControlledVariables}
            onCheckedChange={(checked) =>
              setShowControlledVariables(checked === true)
            }
          />
          Show element-controlled variables
        </label>
      )}
      {versionHistory}
    </>
  );

  const content = (() => {
    if (notebook.isError && !view) {
      return (
        <div className="flex flex-col items-center gap-3 py-12 text-sm">
          <p role="alert">
            {notebook.error.data?.code === "FORBIDDEN" ||
            notebook.error.data?.code === "NOT_FOUND"
              ? "Notebook, document, or version not found, or you don’t have access."
              : "Could not load notebook."}
          </p>
          <Button
            text="Retry"
            variant="outline"
            onClick={() => notebook.refetch()}
          />
        </div>
      );
    }
    if (!view) {
      return (
        <div
          className="flex justify-center py-12"
          role="status"
          aria-label="Loading notebook"
        >
          <Spinner size="md" />
        </div>
      );
    }
    return (
      <NotebookReader
        key={`${notebookId}:${view.version ?? "draft"}`}
        view={view}
        unpublishedUpdatedAt={
          view.isDraft && view.versions.length === 0
            ? view.updatedAt
            : undefined
        }
        liveTableSnapshot={{
          projectId,
          notebookId,
          documentId: view.documentId,
          version: view.version ?? undefined,
          staged: view.isDraft,
        }}
        showControlledVariables={showControlledVariables}
        isLoadingDocument={notebook.isPlaceholderData}
        onDocumentChange={onDocumentChange}
        renderEmbed={(
          kind,
          resourceId,
          variableName,
          sidebar,
          observationId,
        ) => (
          <ConnectedNotebookEmbed
            projectId={projectId}
            kind={kind}
            resourceId={resourceId}
            variableName={variableName}
            sidebar={sidebar}
            observationId={observationId}
          />
        )}
        renderChart={(block, values, filters) => (
          <ConnectedNotebookChart
            block={block}
            values={values}
            filters={filters}
            projectId={projectId}
            notebookId={notebookId}
            documentId={view.documentId}
            staged={view.isDraft}
            version={view.version ?? undefined}
          />
        )}
      />
    );
  })();

  return (
    <div className="ph-no-capture contents">
      <Page
        headerProps={{
          title,
          titleLayout:
            view?.layout.kind === "inbox" || view?.layout.width === "full"
              ? "full"
              : "reading",
          divider: view?.layout.kind !== "tabs",
          titleBadges: view?.isDraft ? (
            <Badge text="Draft" size="sm" />
          ) : undefined,
          actionButtonsRight: view ? headerActions : undefined,
          mobileActionButtons: view ? headerActions : undefined,
          breadcrumb: view
            ? [
                {
                  name: "Notebooks",
                  href: `/project/${encodeURIComponent(view.projectId)}/notebooks`,
                },
              ]
            : undefined,
        }}
      >
        {content}
      </Page>
      {typeof router.query.peek === "string" && (
        <TablePeekViewTraceDetail
          projectId={projectId}
          itemType="TRACE"
          tableName="notebook"
          isV4={isV4}
          layout={router.query.observation ? "observation-focused" : "default"}
          closePeek={closePeek}
          expandPeek={expandPeek}
          disableScopeToggle
        />
      )}
    </div>
  );
}
