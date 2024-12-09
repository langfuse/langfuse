import { DataTable } from "@/src/components/table/data-table";
import TableLink from "@/src/components/table/table-link";
import { api } from "@/src/utils/api";
import { type RouterOutput } from "@/src/utils/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { useQueryParams, withDefault, NumberParam } from "use-query-params";

import { Archive, ListTree, MoreVertical, UploadIcon } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { type DatasetItem, DatasetStatus, type Prisma } from "@langfuse/shared";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import { useEffect, useRef, useState } from "react";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { useRowHeightLocalStorage } from "@/src/components/table/data-table-row-height-switch";
import { IOTableCell } from "@/src/components/ui/CodeJsonViewer";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import useColumnOrder from "@/src/features/column-visibility/hooks/useColumnOrder";
import { StatusBadge } from "@/src/components/layouts/status-badge";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import { z } from "zod";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import {
  type CsvPreviewResult,
  parseCsvPreview,
} from "@/src/features/datasets/lib/parseCsvFile";
import { PreviewCsvImport } from "@/src/features/datasets/components/PreviewCsvImport";

type RowData = {
  id: string;
  source?: {
    traceId: string;
    observationId?: string;
  };
  status: DatasetItem["status"];
  createdAt: string;
  input: Prisma.JsonValue;
  expectedOutput: Prisma.JsonValue;
  metadata: Prisma.JsonValue;
};

const ACCEPTED_FILE_TYPES = ["text/csv", "application/csv"] as const;

const FileSchema = z.object({
  type: z.enum([...ACCEPTED_FILE_TYPES]),
  size: z.number().min(1),
});

export function DatasetItemsTable({
  projectId,
  datasetId,
  menuItems,
}: {
  projectId: string;
  datasetId: string;
  menuItems?: React.ReactNode;
}) {
  const { setDetailPageList } = useDetailPageLists();
  const utils = api.useUtils();
  const capture = usePostHogClientCapture();
  const [preview, setPreview] = useState<CsvPreviewResult | null>(null);
  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
  });

  const [rowHeight, setRowHeight] = useRowHeightLocalStorage(
    "datasetItems",
    "s",
  );

  const hasAccess = useHasProjectAccess({ projectId, scope: "datasets:CUD" });

  const items = api.datasets.itemsByDatasetId.useQuery({
    projectId,
    datasetId,
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
  });

  useEffect(() => {
    if (items.isSuccess) {
      setDetailPageList(
        "datasetItems",
        items.data.datasetItems.map((t) => ({ id: t.id })),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.isSuccess, items.data]);

  const mutUpdate = api.datasets.updateDatasetItem.useMutation({
    onSuccess: () => utils.datasets.invalidate(),
  });

  const mutStoreCsv = api.datasets.storeCsv.useMutation({});

  const columns: LangfuseColumnDef<RowData>[] = [
    {
      accessorKey: "id",
      header: "Item id",
      id: "id",
      size: 90,
      isPinned: true,
      cell: ({ row }) => {
        const id: string = row.getValue("id");
        return (
          <TableLink
            path={`/project/${projectId}/datasets/${datasetId}/items/${id}`}
            value={id}
          />
        );
      },
    },
    {
      accessorKey: "source",
      header: "Source",
      headerTooltip: {
        description:
          "Link to the source trace based on which this item was added",
      },
      id: "source",
      size: 90,
      cell: ({ row }) => {
        const source: RowData["source"] = row.getValue("source");
        if (!source) return null;
        return source.observationId ? (
          <TableLink
            path={`/project/${projectId}/traces/${encodeURIComponent(source.traceId)}?observation=${encodeURIComponent(source.observationId)}`}
            value={source.observationId}
            icon={<ListTree className="h-4 w-4" />}
          />
        ) : (
          <TableLink
            path={`/project/${projectId}/traces/${encodeURIComponent(source.traceId)}`}
            value={source.traceId}
            icon={<ListTree className="h-4 w-4" />}
          />
        );
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      id: "status",
      size: 80,
      cell: ({ row }) => {
        const status: DatasetStatus = row.getValue("status");
        return (
          <StatusBadge
            className="capitalize"
            type={status.toLowerCase()}
            isLive={false}
          />
        );
      },
    },
    {
      accessorKey: "createdAt",
      header: "Created At",
      id: "createdAt",
      size: 150,
      enableHiding: true,
    },
    {
      accessorKey: "input",
      header: "Input",
      id: "input",
      size: 200,
      enableHiding: true,
      cell: ({ row }) => {
        const input = row.getValue("input") as RowData["input"];
        return input !== null ? (
          <IOTableCell data={input} singleLine={rowHeight === "s"} />
        ) : null;
      },
    },
    {
      accessorKey: "expectedOutput",
      header: "Expected Output",
      id: "expectedOutput",
      size: 200,
      enableHiding: true,
      cell: ({ row }) => {
        const expectedOutput = row.getValue(
          "expectedOutput",
        ) as RowData["expectedOutput"];
        return expectedOutput !== null ? (
          <IOTableCell
            data={expectedOutput}
            className="bg-accent-light-green"
            singleLine={rowHeight === "s"}
          />
        ) : null;
      },
    },
    {
      accessorKey: "metadata",
      header: "Metadata",
      id: "metadata",
      size: 200,
      enableHiding: true,
      cell: ({ row }) => {
        const metadata = row.getValue("metadata") as RowData["metadata"];
        return metadata !== null ? (
          <IOTableCell data={metadata} singleLine={rowHeight === "s"} />
        ) : null;
      },
    },
    {
      id: "actions",
      accessorKey: "actions",
      header: "Actions",
      size: 70,
      cell: ({ row }) => {
        const id: string = row.getValue("id");
        const status: DatasetStatus = row.getValue("status");
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only [position:relative]">Open menu</span>
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem
                disabled={!hasAccess}
                onClick={() => {
                  capture("dataset_item:archive_toggle", {
                    status:
                      status === DatasetStatus.ARCHIVED
                        ? "unarchived"
                        : "archived",
                  });
                  mutUpdate.mutate({
                    projectId: projectId,
                    datasetId: datasetId,
                    datasetItemId: id,
                    status:
                      status === DatasetStatus.ARCHIVED
                        ? DatasetStatus.ACTIVE
                        : DatasetStatus.ARCHIVED,
                  });
                }}
              >
                <Archive className="mr-2 h-4 w-4" />
                {status === DatasetStatus.ARCHIVED ? "Unarchive" : "Archive"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  const convertToTableRow = (
    item: RouterOutput["datasets"]["itemsByDatasetId"]["datasetItems"][number],
  ): RowData => {
    return {
      id: item.id,
      source: item.sourceTraceId
        ? {
            traceId: item.sourceTraceId,
            observationId: item.sourceObservationId ?? undefined,
          }
        : undefined,
      status: item.status,
      createdAt: item.createdAt.toLocaleString(),
      input: item.input,
      expectedOutput: item.expectedOutput,
      metadata: item.metadata,
    };
  };

  const [columnVisibility, setColumnVisibility] = useColumnVisibility<RowData>(
    "datasetItemsColumnVisibility",
    columns,
  );

  const [columnOrder, setColumnOrder] = useColumnOrder<RowData>(
    "datasetItemsColumnOrder",
    columns,
  );

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const result = FileSchema.safeParse(file);
    if (!result.success) {
      showErrorToast("Invalid file type", "Please select a valid CSV file");
      event.target.value = "";
      return;
    }

    try {
      // Convert file to base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === "string") {
            // Remove the data URL prefix (e.g., "data:text/csv;base64,")
            const base64 = reader.result.split(",")[1];
            resolve(base64);
          }
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const fileId = await mutStoreCsv.mutateAsync({
        projectId,
        datasetId,
        file: {
          base64,
          name: file.name,
          type: file.type,
        },
      });
      if (!fileId) {
        showErrorToast("Failed to parse CSV", "Memory limit exceeded");
        event.target.value = "";
        return;
      }
      const preview = await parseCsvPreview(file);
      setPreview({ ...preview, fileId });
    } catch (error) {
      showErrorToast(
        "Failed to parse CSV",
        error instanceof Error ? error.message : "Unknown error",
      );
    } finally {
      event.target.value = "";
    }
  };

  useEffect(() => {
    return () => {
      // Clean up any stored files when component unmounts
      // TempFileStorage.cleanup(); >> need to do in trpc route
    };
  }, []);

  if (items.data?.totalDatasetItems === 0) {
    return (
      <>
        <DataTableToolbar
          columns={columns}
          columnVisibility={columnVisibility}
          setColumnVisibility={setColumnVisibility}
          columnOrder={columnOrder}
          setColumnOrder={setColumnOrder}
          rowHeight={rowHeight}
          setRowHeight={setRowHeight}
          actionButtons={menuItems}
        />
        {preview ? (
          <PreviewCsvImport
            preview={preview}
            projectId={projectId}
            datasetId={datasetId}
            setPreview={setPreview}
          />
        ) : (
          <Card className="h-full items-center justify-center p-2">
            <CardHeader className="text-center">
              <CardTitle className="text-lg">
                Your dataset has no items
              </CardTitle>
              <CardDescription>
                Add items to dataset by uploading a file, add items manually or
                via our SDKs/API
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Hidden file input */}
              <Input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept=".csv"
                onChange={handleFileSelect}
              />

              {/* Clickable upload area */}
              <div
                className="flex max-h-full min-h-0 w-full cursor-pointer flex-col items-center justify-center gap-2 overflow-y-auto rounded-lg border border-dashed bg-secondary/50 p-4"
                onClick={() => fileInputRef.current?.click()}
              >
                <UploadIcon className="h-6 w-6 text-secondary-foreground" />
                <div className="text-sm text-secondary-foreground">
                  Click to select a CSV file
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </>
    );
  }

  return (
    <>
      <DataTableToolbar
        columns={columns}
        columnVisibility={columnVisibility}
        setColumnVisibility={setColumnVisibility}
        columnOrder={columnOrder}
        setColumnOrder={setColumnOrder}
        rowHeight={rowHeight}
        setRowHeight={setRowHeight}
        actionButtons={menuItems}
      />
      <DataTable
        columns={columns}
        data={
          items.isLoading
            ? { isLoading: true, isError: false }
            : items.isError
              ? {
                  isLoading: false,
                  isError: true,
                  error: items.error.message,
                }
              : {
                  isLoading: false,
                  isError: false,
                  data: items.data.datasetItems.map((t) =>
                    convertToTableRow(t),
                  ),
                }
        }
        pagination={{
          totalCount: items.data?.totalDatasetItems ?? null,
          onChange: setPaginationState,
          state: paginationState,
        }}
        columnVisibility={columnVisibility}
        onColumnVisibilityChange={setColumnVisibility}
        columnOrder={columnOrder}
        onColumnOrderChange={setColumnOrder}
        rowHeight={rowHeight}
      />
    </>
  );
}
