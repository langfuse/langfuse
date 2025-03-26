import { DataTable } from "@/src/components/table/data-table";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { api } from "@/src/utils/api";
import { type Prisma } from "@langfuse/shared/src/db";
import { useQueryParams, withDefault, NumberParam } from "use-query-params";
import { IOTableCell } from "@/src/components/ui/CodeJsonViewer";
import { useRowHeightLocalStorage } from "@/src/components/table/data-table-row-height-switch";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import useColumnOrder from "@/src/features/column-visibility/hooks/useColumnOrder";
import { type GetModelResult } from "@/src/features/models/validation";
import { DeleteModelButton } from "@/src/features/models/components/DeleteModelButton";
import { EditModelButton } from "@/src/features/models/components/EditModelButton";
import { CloneModelButton } from "@/src/features/models/components/CloneModelButton";
import { PriceBreakdownTooltip } from "@/src/features/models/components/PriceBreakdownTooltip";
import { UserCircle2Icon, PlusIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { LangfuseIcon } from "@/src/components/LangfuseLogo";
import { useRouter } from "next/router";
import { PriceUnitSelector } from "@/src/features/models/components/PriceUnitSelector";
import { usePriceUnitMultiplier } from "@/src/features/models/hooks/usePriceUnitMultiplier";
import { UpsertModelFormDrawer } from "@/src/features/models/components/UpsertModelFormDrawer";
import { ActionButton } from "@/src/components/ActionButton";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { SettingsTableCard } from "@/src/components/layouts/settings-table-card";

export type ModelTableRow = {
  modelId: string;
  maintainer: string;
  modelName: string;
  matchPattern: string;
  prices?: Record<string, number>;
  tokenizerId?: string;
  config?: Prisma.JsonValue;
  lastUsed?: Date | null;
  serverResponse: GetModelResult;
};

const modelConfigDescriptions = {
  modelName:
    "Standardized model name. Generations are assigned to this model name if they match the `matchPattern` upon ingestion.",
  matchPattern:
    "Regex pattern to match `model` parameter of generations to model pricing",
  startDate:
    "Date to start pricing model. If not set, model is active unless a more recent version exists.",
  prices: "Prices per usage type",
  tokenizerId:
    "Tokenizer used for this model to calculate token counts if none are ingested. Pick from list of supported tokenizers.",
  config:
    "Some tokenizers require additional configuration (e.g. openai tiktoken). See docs for details.",
  maintainer:
    "Maintainer of the model. Langfuse managed models can be cloned, user managed models can be edited and deleted. To supersede a Langfuse managed model, set the custom model name to the Langfuse model name.",
  lastUsed: "Start time of the latest generation using this model",
} as const;

export default function ModelTable({ projectId }: { projectId: string }) {
  const router = useRouter();
  const capture = usePostHogClientCapture();
  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
  });
  const models = api.models.getAll.useQuery(
    {
      page: paginationState.pageIndex,
      limit: paginationState.pageSize,
      projectId,
    },
    {
      refetchOnWindowFocus: false,
      refetchOnMount: true,
      refetchOnReconnect: false,
      staleTime: 1000 * 60 * 10,
    },
  );
  const totalCount = models.data?.totalCount ?? null;
  const { priceUnit } = usePriceUnitMultiplier();
  const [rowHeight, setRowHeight] = useRowHeightLocalStorage("models", "m");

  const hasWriteAccess = useHasProjectAccess({
    projectId,
    scope: "models:CUD",
  });

  const columns: LangfuseColumnDef<ModelTableRow>[] = [
    {
      accessorKey: "modelName",
      id: "modelName",
      header: "Model Name",
      headerTooltip: {
        description: modelConfigDescriptions.modelName,
      },
      cell: ({ row }) => {
        return (
          <span className="truncate font-mono text-xs font-semibold">
            {row.original.modelName}
          </span>
        );
      },
      size: 120,
    },
    {
      accessorKey: "maintainer",
      id: "maintainer",
      header: "Maintainer",
      headerTooltip: {
        description: modelConfigDescriptions.maintainer,
      },
      size: 60,
      cell: ({ row }) => {
        const isLangfuse = row.original.maintainer === "Langfuse";
        return (
          <div className="flex justify-center">
            <Tooltip>
              <TooltipTrigger>
                {isLangfuse ? (
                  <LangfuseIcon size={16} />
                ) : (
                  <UserCircle2Icon className="h-4 w-4" />
                )}
              </TooltipTrigger>
              <TooltipContent>
                {isLangfuse ? "Langfuse maintained" : "User maintained"}
              </TooltipContent>
            </Tooltip>
          </div>
        );
      },
    },
    {
      accessorKey: "matchPattern",
      id: "matchPattern",
      headerTooltip: {
        description: modelConfigDescriptions.matchPattern,
      },
      header: "Match Pattern",
      size: 200,
      cell: ({ row }) => {
        const value: string = row.getValue("matchPattern");

        return value ? (
          <span className="truncate font-mono text-xs">{value}</span>
        ) : null;
      },
    },
    {
      accessorKey: "prices",
      id: "prices",
      header: () => {
        return (
          <div className="flex items-center gap-2">
            <span>Prices {priceUnit}</span>
            <PriceUnitSelector />
          </div>
        );
      },
      size: 120,
      cell: ({ row }) => {
        const prices: Record<string, number> | undefined =
          row.getValue("prices");

        return (
          <PriceBreakdownTooltip
            modelName={row.original.modelName}
            prices={prices}
            priceUnit={priceUnit}
            rowHeight={rowHeight}
          />
        );
      },
      enableHiding: true,
    },
    {
      accessorKey: "tokenizerId",
      id: "tokenizerId",
      header: "Tokenizer",
      headerTooltip: {
        description: modelConfigDescriptions.tokenizerId,
      },
      enableHiding: true,
      size: 120,
    },
    {
      accessorKey: "config",
      id: "config",
      header: "Tokenizer Configuration",
      headerTooltip: {
        description: modelConfigDescriptions.config,
      },
      enableHiding: true,
      size: 120,
      cell: ({ row }) => {
        const value: Prisma.JsonValue | undefined = row.getValue("config");

        return value ? (
          <IOTableCell data={value} singleLine={rowHeight === "s"} />
        ) : null;
      },
    },
    {
      accessorKey: "lastUsed",
      id: "lastUsed",
      header: "Last used",
      headerTooltip: {
        description: modelConfigDescriptions.lastUsed,
      },
      enableHiding: true,
      size: 120,
      cell: ({ row }) => {
        const value: Date | null | undefined = row.getValue("lastUsed");
        return value?.toLocaleString() ?? "";
      },
    },
    {
      accessorKey: "actions",
      header: "Actions",
      size: 120,
      cell: ({ row }) => {
        return row.original.maintainer !== "Langfuse" ? (
          <div
            className="flex items-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <EditModelButton
              projectId={projectId}
              modelData={row.original.serverResponse}
            />
            <DeleteModelButton
              projectId={projectId}
              modelData={row.original.serverResponse}
            />
          </div>
        ) : (
          <div onClick={(e) => e.stopPropagation()}>
            <CloneModelButton
              projectId={projectId}
              modelData={row.original.serverResponse}
            />
          </div>
        );
      },
    },
  ];

  const [columnVisibility, setColumnVisibility] =
    useColumnVisibility<ModelTableRow>("modelsColumnVisibility", columns);

  const [columnOrder, setColumnOrder] = useColumnOrder<ModelTableRow>(
    "modelsColumnOrder",
    columns,
  );

  const convertToTableRow = (model: GetModelResult): ModelTableRow => {
    return {
      modelId: model.id,
      maintainer: model.projectId ? "User" : "Langfuse",
      modelName: model.modelName,
      matchPattern: model.matchPattern,
      prices: model.prices,
      tokenizerId: model.tokenizerId ?? undefined,
      config: model.tokenizerConfig,
      lastUsed: model.lastUsed,
      serverResponse: model,
    };
  };

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
        actionButtons={
          <UpsertModelFormDrawer {...{ projectId, action: "create" }}>
            <ActionButton
              variant="secondary"
              icon={<PlusIcon className="h-4 w-4" />}
              hasAccess={hasWriteAccess}
              onClick={() => capture("models:new_form_open")}
            >
              Add model definition
            </ActionButton>
          </UpsertModelFormDrawer>
        }
        className="px-0"
      />
      <SettingsTableCard>
        <DataTable
          columns={columns}
          data={
            models.isLoading
              ? { isLoading: true, isError: false }
              : models.isError
                ? {
                    isLoading: false,
                    isError: true,
                    error: models.error.message,
                  }
                : {
                    isLoading: false,
                    isError: false,
                    data: models.data.models.map((t) => convertToTableRow(t)),
                  }
          }
          pagination={{
            totalCount,
            onChange: setPaginationState,
            state: paginationState,
          }}
          columnVisibility={columnVisibility}
          onColumnVisibilityChange={setColumnVisibility}
          columnOrder={columnOrder}
          onColumnOrderChange={setColumnOrder}
          rowHeight={rowHeight}
          onRowClick={(row) => {
            router.push(`/project/${projectId}/settings/models/${row.modelId}`);
          }}
        />
      </SettingsTableCard>
    </>
  );
}
