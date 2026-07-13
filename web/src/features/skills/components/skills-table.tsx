import { useEffect, useMemo } from "react";
import { DataTable } from "@/src/components/table/data-table";
import {
  DataTableControlsProvider,
  DataTableControls,
} from "@/src/components/table/data-table-controls";
import { ResizableFilterLayout } from "@/src/components/table/resizable-filter-layout";
import TableLink from "@/src/components/table/table-link";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import { DeleteSkill } from "@/src/features/skills/components/delete-skill";
import { DeleteFolder } from "@/src/features/skills/components/delete-folder";
import { DuplicateFolder } from "@/src/features/skills/components/duplicate-folder";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { api } from "@/src/utils/api";
import { TagSkillPopover } from "@/src/features/tag/components/TagSkillPopover";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import { useQueryFilterState } from "@/src/features/filters/hooks/useFilterState";
import { useSidebarFilterState } from "@/src/features/filters/hooks/useSidebarFilterState";
import { skillFilterConfig } from "@/src/features/filters/config/skills-config";
import { useOrderByState } from "@/src/features/orderBy/hooks/useOrderByState";
import { LocalIsoDate } from "@/src/components/LocalIsoDate";
import { useFullTextSearch } from "@/src/components/table/use-cases/useFullTextSearch";
import { useFolderPagination } from "@/src/features/folders/hooks/useFolderPagination";
import { FolderBreadcrumb } from "@/src/features/folders/components/FolderBreadcrumb";
import { FolderBreadcrumbLink } from "@/src/features/folders/components/FolderBreadcrumbLink";
import { useDebounce } from "@/src/hooks/useDebounce";

type SkillTableRow = {
  id: string;
  name: string;
  fullPath: string; // used for navigation/API calls
  type: "folder" | "skill";
  version?: number;
  createdAt?: Date;
  labels?: string[];
  tags?: string[];
};

function createRow(
  data: Partial<SkillTableRow> & {
    id: string;
    name: string;
    fullPath: string;
    type: "folder" | "skill";
  },
): SkillTableRow {
  return {
    version: undefined,
    createdAt: undefined,
    labels: [],
    tags: [],
    ...data,
  };
}

export function SkillTable() {
  const projectId = useProjectIdFromURL() ?? "";
  const { setDetailPageList } = useDetailPageLists();

  const [filterState] = useQueryFilterState([], "skills", projectId);

  const [orderByState, setOrderByState] = useOrderByState({
    column: "createdAt",
    order: "DESC",
  });

  const {
    paginationState,
    currentFolderPath,
    navigateToFolder,
    resetPaginationAndFolder,
    setPaginationAndFolderState,
  } = useFolderPagination();

  const { searchQuery, searchType, setSearchQuery, setSearchType } =
    useFullTextSearch();

  // Reset pagination when search query changes
  useEffect(() => {
    resetPaginationAndFolder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  const skills = api.skills.all.useQuery(
    {
      page: paginationState.pageIndex,
      limit: paginationState.pageSize,
      projectId,
      filter: filterState,
      orderBy: orderByState,
      pathPrefix: currentFolderPath,
      searchQuery: searchQuery || undefined,
      searchType: searchType,
    },
    {
      enabled: Boolean(projectId),
      trpc: {
        context: {
          skipBatch: true,
        },
      },
    },
  );

  // Backend returns folder representatives with row_type metadata
  const processedRowData = useMemo(() => {
    const combinedRows: SkillTableRow[] = [];

    for (const skill of skills.data?.skills ?? []) {
      const isFolder = skill.row_type === "folder";
      // The relative name comes back from the query already stripped of the
      // current folder prefix.
      const itemName = skill.name;
      const fullPath = currentFolderPath
        ? `${currentFolderPath}/${itemName}`
        : itemName;
      const type = isFolder ? "folder" : "skill";

      combinedRows.push(
        createRow({
          id: `${type}-${fullPath}`, // Unique ID for React keys
          name: itemName,
          fullPath,
          type,
          ...(isFolder
            ? {}
            : {
                version: skill.version,
                createdAt: skill.createdAt,
                labels: skill.labels,
                tags: skill.tags,
              }),
        }),
      );
    }

    return combinedRows;
  }, [skills.data, currentFolderPath]);

  const skillFilterOptions = api.skills.filterOptions.useQuery(
    {
      projectId,
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
    },
  );
  const filterOptionTags = skillFilterOptions.data?.tags ?? [];
  const allTags = filterOptionTags.map((t) => t.value);
  const totalCount = skills.data?.totalCount ?? null;

  const newFilterOptions = useMemo(
    () => ({
      labels:
        skillFilterOptions.data?.labels?.map((l) => {
          return {
            value: l.value,
            count:
              "count" in l && l.count !== undefined
                ? Number(l.count)
                : undefined,
          };
        }) ?? undefined,
      tags:
        skillFilterOptions.data?.tags?.map((t) => {
          return {
            value: t.value,
            count:
              "count" in t && t.count !== undefined
                ? Number(t.count)
                : undefined,
          };
        }) ?? undefined,
      version: [],
    }),
    [skillFilterOptions.data],
  );

  const queryFilter = useSidebarFilterState(
    skillFilterConfig,
    newFilterOptions,
    {
      loading: skillFilterOptions.isPending,
      stateLocation: "urlAndSessionStorage",
      sessionFilterContextId: projectId ?? null,
    },
  );

  useEffect(() => {
    if (skills.isSuccess) {
      setDetailPageList(
        "skills",
        skills.data.skills.map((s) => ({ id: s.name })),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skills.isSuccess, skills.data]);

  const skillColumns: LangfuseColumnDef<SkillTableRow>[] = [
    {
      accessorKey: "name",
      header: "Name",
      id: "name",
      enableSorting: true,
      size: 250,
      cell: ({ getValue, row }) => {
        const name = getValue<string>();
        const rowData = row.original;

        if (rowData.type === "folder") {
          return (
            <FolderBreadcrumbLink
              name={name}
              onClick={() => navigateToFolder(rowData.fullPath)}
            />
          );
        }

        return name ? (
          <TableLink
            path={`/project/${projectId}/skills/${encodeURIComponent(rowData.fullPath)}`}
            value={name}
            title={rowData.fullPath} // Show full skill path on hover
          />
        ) : undefined;
      },
    },
    {
      accessorKey: "version",
      header: "Versions",
      id: "version",
      enableSorting: true,
      size: 70,
      cell: ({ getValue, row }) => {
        if (row.original.type === "folder") return null;
        return getValue<number | undefined>();
      },
    },
    {
      accessorKey: "createdAt",
      header: "Latest Version Created At",
      id: "createdAt",
      enableSorting: true,
      size: 200,
      cell: ({ getValue, row }) => {
        if (row.original.type === "folder") return null;
        const createdAt = getValue<Date | undefined>();
        return createdAt ? <LocalIsoDate date={createdAt} /> : null;
      },
    },
    {
      accessorKey: "tags",
      header: "Tags",
      id: "tags",
      enableSorting: true,
      size: 120,
      cell: ({ getValue, row }) => {
        // height h-6 to ensure consistent row height for normal & folder rows
        if (row.original.type === "folder") return <div className="h-6" />;

        const tags = getValue<string[] | undefined>();
        const skillPath = row.original.fullPath;
        return (
          <TagSkillPopover
            tags={tags ?? []}
            availableTags={allTags}
            projectId={projectId}
            skillName={skillPath}
            skillsFilter={{
              page: 0,
              limit: 50,
              projectId,
              filter: filterState,
              orderBy: orderByState,
            }}
          />
        );
      },
      enableHiding: true,
    },
    {
      accessorKey: "id",
      id: "actions",
      header: "Actions",
      size: 70,
      enableSorting: false,
      cell: ({ row }) => {
        const rowData = row.original;
        if (rowData.type === "folder") {
          return (
            <div className="flex gap-1">
              <DuplicateFolder folderPath={rowData.fullPath} />
              <DeleteFolder folderPath={rowData.fullPath} />
            </div>
          );
        }

        const skillPath = rowData.fullPath;
        return <DeleteSkill skillName={skillPath} />;
      },
    },
  ];

  return (
    <DataTableControlsProvider
      tableName={skillFilterConfig.tableName}
      defaultSidebarCollapsed={skillFilterConfig.defaultSidebarCollapsed}
    >
      <div className="flex h-full w-full flex-col">
        {/* Toolbar spanning full width */}
        {currentFolderPath && (
          <FolderBreadcrumb
            currentFolderPath={currentFolderPath}
            navigateToFolder={navigateToFolder}
          />
        )}
        <DataTableToolbar
          columns={skillColumns}
          filterState={queryFilter.filterState}
          columnsWithCustomSelect={["labels", "tags"]}
          searchConfig={{
            metadataSearchFields: ["Name", "Tags", "Content"],
            updateQuery: useDebounce(setSearchQuery, 300),
            currentQuery: searchQuery ?? undefined,
            tableAllowsFullTextSearch: true,
            setSearchType,
            searchType,
            customDropdownLabels: {
              metadata: "Names, Tags",
              fullText: "Full Text",
            },
            hidePerformanceWarning: true,
            availableSearchTypes: {
              content: true,
              input: false,
              output: false,
            },
          }}
        />

        {/* Content area with sidebar and table */}
        <ResizableFilterLayout>
          <DataTableControls queryFilter={queryFilter} />

          <div className="flex flex-1 flex-col overflow-hidden">
            <DataTable
              tableName="skills"
              columns={skillColumns}
              data={
                skills.isLoading
                  ? { isLoading: true, isError: false }
                  : skills.isError
                    ? {
                        isLoading: false,
                        isError: true,
                        error: skills.error.message,
                      }
                    : {
                        isLoading: false,
                        isError: false,
                        data: processedRowData.map((item) => ({
                          id: item.id,
                          name: item.name,
                          fullPath: item.fullPath,
                          version: item.version,
                          createdAt: item.createdAt,
                          type: item.type,
                          labels: item.labels,
                          tags: item.tags,
                        })),
                      }
              }
              orderBy={orderByState}
              setOrderBy={setOrderByState}
              pagination={{
                totalCount,
                onChange: setPaginationAndFolderState,
                state: paginationState,
              }}
              cellPadding="comfortable"
            />
          </div>
        </ResizableFilterLayout>
      </div>
    </DataTableControlsProvider>
  );
}
