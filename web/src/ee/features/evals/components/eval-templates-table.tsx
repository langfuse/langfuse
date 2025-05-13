import { LangfuseIcon } from "@/src/components/LangfuseLogo";
import { DataTable } from "@/src/components/table/data-table";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { type RouterOutputs, api } from "@/src/utils/api";
import { createColumnHelper } from "@tanstack/react-table";
import { UserCircle2Icon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import {
  useQueryParams,
  withDefault,
  NumberParam,
  useQueryParam,
  StringParam,
} from "use-query-params";
import { useEffect } from "react";
import TableIdOrName from "@/src/components/table/table-id";
import { PeekViewEvaluatorTemplateDetail } from "@/src/components/table/peek/peek-evaluator-template-detail";
import { useEvalTemplatesPeekNavigation } from "@/src/components/table/peek/hooks/useEvalTemplatesPeekNavigation";
import { usePeekState } from "@/src/components/table/peek/hooks/usePeekState";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";

export type EvalsTemplateRow = {
  name: string;
  maintainer: string;
  latestCreatedAt?: Date;
  latestVersion?: number;
  id?: string;
};

export default function EvalsTemplateTable({
  projectId,
}: {
  projectId: string;
}) {
  const { setDetailPageList } = useDetailPageLists();
  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
  });
  const [searchQuery, setSearchQuery] = useQueryParam(
    "search",
    withDefault(StringParam, null),
  );

  const templates = api.evals.templateNames.useQuery({
    projectId,
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
    searchQuery: searchQuery,
  });
  const totalCount = templates.data?.totalCount ?? null;

  useEffect(() => {
    if (templates.isSuccess) {
      setDetailPageList(
        "eval-templates",
        templates.data.templates.map((template) => ({ id: template.latestId })),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates.isSuccess, templates.data]);

  const columnHelper = createColumnHelper<EvalsTemplateRow>();

  const columns = [
    columnHelper.accessor("name", {
      header: "Name",
      id: "name",
      cell: (row) => {
        const name = row.getValue();
        return name ? <TableIdOrName value={name} /> : undefined;
      },
    }),
    columnHelper.accessor("maintainer", {
      id: "maintainer",
      header: "Maintainer",
      size: 150,
      cell: (row) => {
        const isLangfuse = row.getValue().includes("Langfuse");
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
              <TooltipContent>{row.getValue()}</TooltipContent>
            </Tooltip>
          </div>
        );
      },
    }),
    columnHelper.accessor("latestCreatedAt", {
      header: "Last Edit",
      id: "latestCreatedAt",
      cell: (row) => {
        return row.getValue()?.toLocaleDateString();
      },
    }),
    columnHelper.accessor("latestVersion", {
      header: "Latest Version",
      id: "version",
      enableHiding: true,
      cell: (row) => {
        return row.getValue();
      },
    }),
    columnHelper.accessor("id", {
      header: "Id",
      id: "id",
      size: 100,
      enableHiding: true,
      cell: (row) => {
        return row.getValue();
      },
    }),
  ] as LangfuseColumnDef<EvalsTemplateRow>[];

  const [columnVisibility, setColumnVisibility] =
    useColumnVisibility<EvalsTemplateRow>(
      "evalTemplatesColumnVisibility",
      columns,
    );

  const urlPathname = `/project/${projectId}/evals/templates`;
  const { getNavigationPath, expandPeek } =
    useEvalTemplatesPeekNavigation(urlPathname);
  const { setPeekView } = usePeekState(urlPathname);

  const convertToTableRow = (
    template: RouterOutputs["evals"]["templateNames"]["templates"][number],
  ): EvalsTemplateRow => {
    return {
      name: template.name,
      maintainer: !!template.projectId
        ? "User maintained"
        : "Langfuse maintained",
      latestCreatedAt: template.latestCreatedAt,
      latestVersion: template.version,
      id: template.latestId,
    };
  };

  return (
    <>
      <DataTableToolbar
        columns={columns}
        columnVisibility={columnVisibility}
        setColumnVisibility={setColumnVisibility}
        searchConfig={{
          metadataSearchFields: ["Name"],
          updateQuery: setSearchQuery,
          currentQuery: searchQuery ?? undefined,
          tableAllowsFullTextSearch: false,
          setSearchType: undefined,
          searchType: undefined,
        }}
      />
      <DataTable
        columns={columns}
        peekView={{
          itemType: "EVALUATOR",
          listKey: "eval-templates",
          urlPathname,
          onOpenChange: setPeekView,
          onExpand: expandPeek,
          shouldUpdateRowOnDetailPageNavigation: true,
          getNavigationPath,
          children: (row) => (
            <PeekViewEvaluatorTemplateDetail projectId={projectId} row={row} />
          ),
          tableDataUpdatedAt: templates.dataUpdatedAt,
        }}
        data={
          templates.isLoading
            ? { isLoading: true, isError: false }
            : templates.isError
              ? {
                  isLoading: false,
                  isError: true,
                  error: templates.error.message,
                }
              : {
                  isLoading: false,
                  isError: false,
                  data: templates.data.templates.map((t) =>
                    convertToTableRow(t),
                  ),
                }
        }
        pagination={{
          totalCount,
          onChange: setPaginationState,
          state: paginationState,
        }}
        columnVisibility={columnVisibility}
        onColumnVisibilityChange={setColumnVisibility}
      />
    </>
  );
}
