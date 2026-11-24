import { Fragment, useState, type ComponentProps } from "react";
import { ArrowUpDown, Check } from "@langfuse/icons";
import { type CellContext } from "@tanstack/react-table";
import { Badge } from "@/src/components/design-system/Badge/Badge";

import { DropdownMenu } from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { Spinner } from "@/src/components/design-system/Spinner/Spinner";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { TableCard } from "@/src/components/TableCard/TableCard";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { readingColumnClassName } from "@/src/components/layouts/reading-column";
import { Sheet, SheetContent, SheetTitle } from "@/src/components/ui/sheet";
import { usePeekPanelState } from "@/src/components/table/peek/usePeekPanelState";
import {
  type NotebookPropertySchema,
  type NotebookPropertyValues,
} from "@/src/features/notebooks/schema";
import { cn } from "@/src/utils/tailwind";
import { type RouterOutput } from "@/src/utils/types";
import { NotebookBlocks } from "./components/NotebookBlocks/NotebookBlocks";

function formatProperty(
  value: NotebookPropertyValues[string] | undefined,
  type: string,
) {
  if (value === undefined) return;
  if (Array.isArray(value)) return value.length ? value.join(", ") : undefined;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return value.toLocaleString();
  if (type === "date") {
    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeZone: "UTC",
    }).format(new Date(value));
  }
  return value;
}

function renderProperty(
  field: NotebookPropertySchema["fields"][number],
  value: NotebookPropertyValues[string] | undefined,
) {
  if (!("options" in field) || value === undefined) {
    return formatProperty(value, field.type);
  }
  const values = Array.isArray(value) ? value : [String(value)];
  return values.map((text, index) => {
    const option = field.options.find(
      (option) => typeof option !== "string" && option.value === text,
    );
    const color = typeof option === "object" ? option.color : undefined;
    return (
      <Fragment key={index}>
        {index > 0 && ", "}
        {color ? (
          <Badge
            size="sm"
            color={
              (
                {
                  danger: "error",
                  neutral: "filled",
                  warning: "warning",
                  success: "success",
                  info: "info",
                } as const
              )[color]
            }
            text={text}
          />
        ) : (
          text
        )}
      </Fragment>
    );
  });
}

export function NotebookReader({
  view,
  isLoadingDocument,
  onDocumentChange,
  renderChart,
  tableDocumentOpen = false,
}: {
  view: Pick<
    RouterOutput["notebooks"]["view"],
    "blocks" | "documentId" | "documents" | "layout" | "version" | "width"
  >;
  isLoadingDocument: boolean;
  onDocumentChange: (documentId: string | null, version: number | null) => void;
  renderChart: ComponentProps<typeof NotebookBlocks>["renderChart"];
  tableDocumentOpen?: boolean;
}) {
  const { blocks, documentId, documents, layout, version, width } = view;
  const [sort, setSort] = useState("");
  const [peekExpanded, setPeekExpanded] = useState(false);
  const peek = usePeekPanelState({
    isOpen: layout.kind === "table" && tableDocumentOpen,
    isExpanded: peekExpanded,
    onExpandedChange: setPeekExpanded,
    widthStorageKey: "notebook-peek-width",
  });
  const metadata =
    layout.kind === "default"
      ? layout.document
      : layout.documents.find((document) => document.documentId === documentId);
  const headerProperties = (layout.propertySchema?.fields ?? []).flatMap(
    (field) => {
      const displayValue = formatProperty(
        metadata?.properties?.[field.id],
        field.type,
      );
      if (displayValue === undefined) return [];
      return [{ field, value: metadata?.properties?.[field.id] }];
    },
  );
  const documentContent = (() => {
    if (isLoadingDocument) {
      return (
        <div
          className="flex justify-center py-12"
          role="status"
          aria-label="Loading notebook version"
        >
          <Spinner size="md" />
        </div>
      );
    }
    if (!blocks.length) {
      return (
        <p className="text-muted-foreground text-sm">This document is empty.</p>
      );
    }
    return <NotebookBlocks blocks={blocks} renderChart={renderChart} />;
  })();
  const documentPanel = (
    <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
      <div
        className={cn(
          readingColumnClassName,
          "py-6",
          { contained: null, full: "max-w-none" }[width],
        )}
      >
        {!isLoadingDocument &&
          (metadata?.title || headerProperties.length > 0) && (
            <header className="mb-6 space-y-3">
              {metadata?.title && (
                <h2 className="text-xl font-bold wrap-break-word">
                  {metadata.title}
                </h2>
              )}
              {headerProperties.length > 0 && (
                <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {headerProperties.map(({ field, value }) => (
                    <div
                      key={field.id}
                      className="flex min-w-0 flex-wrap items-baseline gap-x-1"
                    >
                      <dt className="text-muted-foreground">{field.label}:</dt>
                      <dd
                        className={cn(
                          "min-w-0 wrap-break-word",
                          field.type === "select" &&
                            !field.options.some(
                              (option) =>
                                typeof option === "object" &&
                                option.value === value &&
                                option.color,
                            ) &&
                            "bg-muted rounded px-1.5 font-medium",
                        )}
                      >
                        {renderProperty(field, value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </header>
          )}
        {documentContent}
      </div>
    </div>
  );
  const notebookContent = (() => {
    if (layout.kind === "default") return documentPanel;
    const availableIds = new Set(documents.map(({ id }) => id));
    if (layout.kind === "tabs") {
      const entries = layout.documents.filter(({ documentId }) =>
        availableIds.has(documentId),
      );
      return (
        <Tabs
          layout="fill"
          value={documentId}
          activationMode="manual"
          onValueChange={(id) => onDocumentChange(id, version)}
        >
          <div className="shrink-0 border-b">
            <div
              className={cn(
                readingColumnClassName,
                "flex items-center pt-1 pb-2 sm:h-9 sm:px-2 sm:py-0",
              )}
            >
              <Tabs.List
                variant="underline"
                aria-label="Notebook documents"
                overflow="menu"
              >
                {entries.map(({ documentId, title, label }) => (
                  <Tabs.Trigger
                    key={documentId}
                    value={documentId}
                    label={title ?? label ?? documentId}
                  />
                ))}
              </Tabs.List>
            </div>
          </div>
          <Tabs.Content value={documentId} layout="fill">
            {documentPanel}
          </Tabs.Content>
        </Tabs>
      );
    }
    const entries = layout.documents.filter(({ documentId }) =>
      availableIds.has(documentId),
    );
    const propertySchema = layout.propertySchema;
    const visibleFields =
      propertySchema?.fields.filter(
        ({ id }) =>
          layout.kind === "table" ||
          propertySchema.visibleByDefault?.includes(id),
      ) ?? [];
    const [direction, fieldId] = sort.split(":");
    const sortField = visibleFields.find(({ id }) => id === fieldId);
    const sortByTitle = layout.kind === "table" && fieldId === "__title";
    if (sortByTitle) {
      entries.sort((a, b) => {
        const order = (a.title ?? a.label ?? a.documentId).localeCompare(
          b.title ?? b.label ?? b.documentId,
        );
        return direction === "desc" ? -order : order;
      });
    }
    if (sortField) {
      const options =
        "options" in sortField
          ? sortField.options.map((option) =>
              typeof option === "string" ? option : option.value,
            )
          : [];
      entries.sort((left, right) => {
        const a = left.properties?.[sortField.id];
        const b = right.properties?.[sortField.id];
        const aMissing = a === undefined || (Array.isArray(a) && !a.length);
        const bMissing = b === undefined || (Array.isArray(b) && !b.length);
        if (aMissing || bMissing) return Number(aMissing) - Number(bMissing);

        let order = 0;
        if (typeof a === "number" && typeof b === "number") {
          order = a - b;
        } else if (typeof a === "boolean" && typeof b === "boolean") {
          order = Number(a) - Number(b);
        } else if (sortField.type === "select") {
          order = options.indexOf(String(a)) - options.indexOf(String(b));
        } else if (
          sortField.type === "multi-select" &&
          Array.isArray(a) &&
          Array.isArray(b)
        ) {
          const aRanks = a
            .map((value) => options.indexOf(value))
            .sort((x, y) => x - y);
          const bRanks = b
            .map((value) => options.indexOf(value))
            .sort((x, y) => x - y);
          for (
            let index = 0;
            index < Math.min(aRanks.length, bRanks.length);
            index++
          ) {
            order = aRanks[index] - bRanks[index];
            if (order !== 0) break;
          }
          if (order === 0) order = aRanks.length - bRanks.length;
        } else {
          order = String(a).localeCompare(String(b));
        }
        return direction === "desc" ? -order : order;
      });
    }
    if (layout.kind === "table") {
      const rows = entries.map((entry) => ({ ...entry, id: entry.documentId }));
      type Entry = (typeof rows)[number];
      return (
        <>
          <div className="min-h-0 min-w-0 overflow-auto p-4">
            <TableCard
              tableName="notebook-documents"
              columns={[
                createTextTableColumn<Entry>({
                  id: "__title",
                  accessorFn: (entry) =>
                    entry.title ?? entry.label ?? entry.documentId,
                  header: "Document",
                  size: 280,
                  enableSorting: true,
                }),
                ...visibleFields.map((field) => ({
                  ...createTextTableColumn<Entry>({
                    id: field.id,
                    accessorFn: (entry) =>
                      formatProperty(entry.properties?.[field.id], field.type),
                    header: field.label,
                    enableSorting: true,
                  }),
                  ...("options" in field && {
                    cell: ({ row }: CellContext<Entry, unknown>) =>
                      renderProperty(
                        field,
                        row.original.properties?.[field.id],
                      ),
                  }),
                })),
              ]}
              data={{ status: "success", data: rows }}
              orderBy={
                sortByTitle || sortField
                  ? {
                      column: fieldId,
                      order: direction === "desc" ? "DESC" : "ASC",
                    }
                  : null
              }
              setOrderBy={(order) =>
                setSort(
                  order ? `${order.order.toLowerCase()}:${order.column}` : "",
                )
              }
              onRowClick={(entry) =>
                onDocumentChange(entry.documentId, version)
              }
              getRowLabel={(entry) =>
                entry.title ?? entry.label ?? entry.documentId
              }
              selectedRowId={tableDocumentOpen ? documentId : null}
            />
          </div>
          <Sheet
            modal={false}
            open={tableDocumentOpen}
            onOpenChange={(open) => {
              if (!open) onDocumentChange(null, version);
            }}
          >
            <SheetContent
              aria-describedby={undefined}
              style={peek.panelStyle}
              className={cn(
                "flex max-w-none flex-col gap-0 p-0 max-sm:w-full! sm:max-w-none",
                peek.isResizing && "select-none",
              )}
              onInteractOutside={(event) => event.preventDefault()}
            >
              <SheetTitle className="shrink-0 border-b px-4 py-3 pr-12 text-sm">
                Document preview
              </SheetTitle>
              {documentPanel}
              <div
                {...peek.resizeHandleProps}
                className="hover:bg-muted-foreground/30 focus-visible:bg-muted-foreground/40 absolute inset-y-0 -left-1 z-20 hidden w-3 cursor-ew-resize touch-none sm:block"
              />
            </SheetContent>
          </Sheet>
        </>
      );
    }
    return (
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <nav
          aria-label="Notebook documents"
          className="bg-surface max-h-44 shrink-0 overflow-y-auto border-b md:max-h-none md:w-64 md:border-r md:border-b-0"
        >
          {visibleFields.length > 0 && (
            <div className="flex items-center justify-between border-b px-3 py-1">
              <span className="text-muted-foreground text-xs font-medium">
                Documents
              </span>
              <DropdownMenu
                title="Sort by"
                placement="bottom-end"
                items={[
                  {
                    id: "original",
                    type: "item",
                    title: "Original order",
                    icon: sortField ? undefined : Check,
                    onClick: () => setSort(""),
                  },
                  { id: "sort-options", type: "separator" },
                  ...visibleFields.flatMap(({ id, label }) =>
                    (["asc", "desc"] as const).map((order) => {
                      const option = `${order}:${id}`;
                      return {
                        id: option,
                        type: "item" as const,
                        title: `${label} ${order === "asc" ? "ascending" : "descending"}`,
                        icon: sort === option ? Check : undefined,
                        onClick: () => setSort(option),
                      };
                    }),
                  ),
                ]}
              >
                {({ getTriggerProps }) => (
                  <button
                    {...getTriggerProps()}
                    type="button"
                    aria-label="Sort documents"
                    title={
                      sortField
                        ? `Sorted by ${sortField.label}`
                        : "Sort documents"
                    }
                    className="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring flex size-7 items-center justify-center rounded focus-visible:ring-2 focus-visible:outline-hidden"
                  >
                    <ArrowUpDown size="sm" aria-hidden />
                  </button>
                )}
              </DropdownMenu>
            </div>
          )}
          <ul className="space-y-0.5 p-1.5">
            {entries.map(({ documentId: id, title, label, properties }) => {
              const name = title ?? label ?? id;
              const metadata = visibleFields.flatMap((field) => {
                const displayValue = formatProperty(
                  properties?.[field.id],
                  field.type,
                );
                if (displayValue === undefined) return [];
                return [{ field, value: displayValue }];
              });
              return (
                <li key={id}>
                  <button
                    type="button"
                    aria-current={id === documentId ? "true" : undefined}
                    className="hover:bg-accent/60 focus-visible:ring-ring aria-[current=true]:bg-accent block w-full rounded-md px-2.5 py-2 text-left focus-visible:ring-2 focus-visible:outline-hidden focus-visible:ring-inset"
                    onClick={() => {
                      if (id !== documentId) onDocumentChange(id, version);
                    }}
                  >
                    <span
                      className="block truncate text-sm font-medium"
                      title={name}
                    >
                      {name}
                    </span>
                    {metadata.length > 0 && (
                      <span className="text-muted-foreground mt-1 flex min-h-5 items-center gap-2 text-xs">
                        {metadata.map(({ field, value }) => (
                          <span
                            key={field.id}
                            className={cn(
                              "inline-flex min-w-0 items-center gap-1",
                              field.id === "priority" &&
                                "ml-auto max-w-1/2 shrink-0",
                            )}
                            title={`${field.label}: ${value}`}
                          >
                            <span>{field.label}:</span>{" "}
                            <span className="min-w-0 truncate" title={value}>
                              {field.id === "priority"
                                ? renderProperty(field, properties?.[field.id])
                                : value}
                            </span>
                          </span>
                        ))}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
        {documentPanel}
      </div>
    );
  })();

  return <div className="flex min-h-0 flex-1 flex-col">{notebookContent}</div>;
}
