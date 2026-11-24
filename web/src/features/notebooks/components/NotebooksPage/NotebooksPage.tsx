import { NotebookText } from "@langfuse/icons";

import { Button } from "@/src/components/design-system/Button/Button";
import { PaginationBar } from "@/src/components/design-system/PaginationBar/PaginationBar";
import { SearchInput } from "@/src/components/design-system/SearchInput/SearchInput";
import {
  Table,
  type AsyncTableData,
} from "@/src/components/design-system/table/Table";
import { createLinkTableColumn } from "@/src/components/design-system/table/columns/createLinkTableColumn";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import Page from "@/src/components/layouts/Page";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { type RouterOutput } from "@/src/utils/types";
import { useNotebookList } from "./useNotebookList";

type Notebook = RouterOutput["notebooks"]["list"]["notebooks"][number];

const columns = [
  createLinkTableColumn<Notebook>({
    accessorKey: "title",
    header: "Notebook",
    size: 320,
    sensitive: true,
    getCell: (title, { row }) => ({
      type: "link",
      props: {
        value: title || "Untitled notebook",
        path: row.original.url,
        icon: NotebookText,
      },
    }),
  }),
  createTextTableColumn<Notebook, number>({
    accessorKey: "publishedVersion",
    header: "Published version",
    size: 160,
    mapValue: (version) =>
      version == null ? "Not published" : `Version ${version}`,
  }),
  createTextTableColumn<Notebook, boolean>({
    accessorKey: "dirty",
    header: "Status",
    size: 180,
    mapValue: (dirty, { row }) => {
      if (row.original.publishedVersion === null) return "Draft";
      if (dirty) return "Unpublished changes";
      return "Published";
    },
  }),
];

export function NotebooksPage() {
  const projectId = useProjectIdFromURL();

  return (
    <Page headerProps={{ title: "Notebooks" }}>
      {projectId && (
        <ConnectedNotebookList key={projectId} projectId={projectId} />
      )}
    </Page>
  );
}

function ConnectedNotebookList({ projectId }: { projectId: string }) {
  const { notebooks, hasSearch, searchInputProps, pagination } =
    useNotebookList(projectId);
  const data: AsyncTableData<Notebook[]> = notebooks.data
    ? { status: "success", data: notebooks.data.notebooks }
    : { status: "loading" };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="ph-no-capture p-3 sm:max-w-sm">
        <SearchInput placeholder="Search notebooks" {...searchInputProps} />
      </div>
      {notebooks.isError ? (
        <div className="flex flex-col items-center gap-3 py-12 text-sm">
          <p role="alert">Could not load notebooks.</p>
          <Button
            text="Retry"
            variant="outline"
            onClick={() => notebooks.refetch()}
          />
          {pagination.pageIndex > 0 && (
            <Button
              text="Previous page"
              variant="text"
              onClick={pagination.previousPage}
            />
          )}
        </div>
      ) : (
        <Table
          tableName="notebooks"
          columns={columns}
          data={data}
          noResultsMessage={
            hasSearch ? "No notebooks match your search." : "No notebooks yet."
          }
        />
      )}
      {!notebooks.isError &&
        (pagination.pageIndex > 0 || pagination.hasNextPage) && (
          <PaginationBar
            mode="cursor"
            state={{ pageIndex: pagination.pageIndex, pageSize: 1 }}
            hasNextPage={pagination.hasNextPage}
            onChange={pagination.onChange}
          />
        )}
    </div>
  );
}
