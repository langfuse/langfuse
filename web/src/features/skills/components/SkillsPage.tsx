import Link from "next/link";
import { FileCode2, Plus, Trash } from "lucide-react";
import { NumberParam, useQueryParams, withDefault } from "use-query-params";
import Page from "@/src/components/layouts/page";
import { Button } from "@/src/components/ui/button";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { PaginationBar } from "@/src/components/design-system/PaginationBar/PaginationBar";
import {
  Table,
  type AsyncTableData,
} from "@/src/components/design-system/table/Table";
import { createLinkTableColumn } from "@/src/components/design-system/table/columns/createLinkTableColumn";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { createNumberTableColumn } from "@/src/components/design-system/table/columns/createNumberTableColumn";
import { createDateTableColumn } from "@/src/components/design-system/table/columns/createDateTableColumn";
import { createBadgeListTableColumn } from "@/src/components/design-system/table/columns/createBadgeListTableColumn";
import {
  DataTableControls,
  DataTableControlsProvider,
} from "@/src/components/table/data-table-controls";
import { FilterToggleButton } from "@/src/components/table/FilterToggleButton";
import { ResizableFilterLayout } from "@/src/components/table/resizable-filter-layout";
import { useSidebarFilterState } from "@/src/features/filters";
import {
  TableSearchBar,
  toObservedOptions,
  useFullTextSearch,
} from "@/src/features/search-bar";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { api } from "@/src/utils/api";
import { type RouterOutput } from "@/src/utils/types";
import {
  SKILLS_FIELD_REGISTRY,
  skillsFilterConfig,
} from "../constants/skillsFilterConfig";

type SkillRow = RouterOutput["skills"]["all"]["data"][number];

export function SkillsPage() {
  const projectId = useProjectIdFromURL() ?? "";
  const canCreate = useHasProjectAccess({ projectId, scope: "skills:CUD" });
  const capture = usePostHogClientCapture();
  const newSkillHref = `/project/${projectId}/skills/new`;

  return (
    <Page
      headerProps={{
        title: "Skills",
        help: {
          description:
            "Create, version, and distribute reusable agent skills from one place.",
          href: "https://langfuse.com/docs",
        },
        actionButtonsRight: (
          <NewSkillButton
            canCreate={canCreate}
            href={newSkillHref}
            onOpen={() => capture("skills:new_form_open")}
          />
        ),
      }}
    >
      <SkillsList key={projectId} projectId={projectId} canDelete={canCreate} />
    </Page>
  );
}

function SkillsList({
  projectId,
  canDelete,
}: {
  projectId: string;
  canDelete: boolean;
}) {
  const utils = api.useUtils();
  const capture = usePostHogClientCapture();
  const [pagination, setPagination] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
  });
  const paginationState = {
    pageIndex: Number.isFinite(pagination.pageIndex)
      ? Math.max(0, Math.floor(pagination.pageIndex))
      : 0,
    pageSize: Number.isFinite(pagination.pageSize)
      ? Math.max(1, Math.min(100, Math.floor(pagination.pageSize)))
      : 50,
  };
  const { searchQuery, setSearchQuery } = useFullTextSearch({
    tableAllowsFullTextSearch: false,
  });
  const filterOptions = api.skills.filterOptions.useQuery(
    { projectId },
    { enabled: Boolean(projectId) },
  );
  const observedOptions = filterOptions.data ?? { tags: [] };
  const queryFilter = useSidebarFilterState(
    skillsFilterConfig,
    observedOptions,
    {
      stateLocation: "urlAndSessionStorage",
      sessionFilterContextId: projectId,
      loading: filterOptions.isPending,
      isV4: false,
      onExplicitFilterStateChange: () => setPagination({ pageIndex: 0 }),
    },
  );
  const skills = api.skills.all.useQuery(
    {
      projectId,
      page: paginationState.pageIndex + 1,
      limit: paginationState.pageSize,
      search: searchQuery || undefined,
      filter: queryFilter.filterState,
    },
    { enabled: Boolean(projectId) },
  );
  const deleteSkill = api.skills.deleteSkill.useMutation({
    onSuccess: async () => {
      capture("skills:delete");
      if (skills.data?.data.length === 1 && paginationState.pageIndex > 0) {
        setPagination({ pageIndex: paginationState.pageIndex - 1 });
      }
      await utils.skills.invalidate();
    },
  });

  let tableData: AsyncTableData<SkillRow[]> = { status: "loading" };
  if (skills.isError)
    tableData = { status: "error", error: skills.error.message };
  else if (skills.data)
    tableData = { status: "success", data: skills.data.data };
  const hasFilters = Boolean(searchQuery) || queryFilter.filterState.length > 0;
  const isEmptyProject =
    skills.data?.meta.totalItems === 0 &&
    !hasFilters &&
    paginationState.pageIndex === 0;
  const columns = [
    createLinkTableColumn<SkillRow>({
      accessorKey: "name",
      header: "Name",
      size: 220,
      cellClassName: "ph-no-capture",
      getCell: (name) =>
        name
          ? {
              type: "link",
              props: {
                value: name,
                path: `/project/${projectId}/skills/${encodeURIComponent(name)}`,
              },
            }
          : undefined,
    }),
    createTextTableColumn<SkillRow>({
      accessorKey: "description",
      header: "Description",
      size: 280,
      cellClassName: "ph-no-capture",
    }),
    createNumberTableColumn<SkillRow>({
      accessorKey: "latestVersion",
      header: "Latest version",
      size: 100,
      formatter: (version) => `v${version}`,
    }),
    createNumberTableColumn<SkillRow>({
      accessorKey: "productionVersion",
      header: "Production version",
      size: 140,
      formatter: (version) => `v${version}`,
      emptyValue: "Not set",
    }),
    createBadgeListTableColumn<SkillRow>({
      accessorKey: "tags",
      header: "Tags",
      size: 120,
      shouldWrap: false,
      cellClassName: "ph-no-capture",
    }),
    createDateTableColumn<SkillRow>({
      accessorKey: "latestVersionCreatedAt",
      header: "Latest version created",
      size: 175,
    }),
  ];

  return (
    <DataTableControlsProvider tableName="skills" defaultSidebarCollapsed>
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex items-center gap-2 px-3 py-2">
          <div className="md:hidden">
            <FilterToggleButton filterState={queryFilter.filterState} />
          </div>
          <div className="min-w-0 flex-1">
            <TableSearchBar
              key={`${projectId}:${queryFilter.draftResetKey}`}
              projectId={projectId}
              tableName="skills"
              registry={SKILLS_FIELD_REGISTRY}
              filterState={queryFilter.searchBarFilterState}
              setFilterState={queryFilter.setFilterState}
              observed={toObservedOptions(
                observedOptions,
                filterOptions.isPending,
              )}
              isV4={false}
              search={{
                query: searchQuery,
                type: ["id"],
                setQuery: (query) => {
                  setPagination({ pageIndex: 0 });
                  setSearchQuery(query);
                },
              }}
            />
          </div>
        </div>
        <ResizableFilterLayout>
          <DataTableControls queryFilter={queryFilter} />
          <DialogController<string>
            onBeforeClose={() => !deleteSkill.isPending}
            onDismiss={deleteSkill.reset}
            renderDialog={({ state: name, closeDialog }) => (
              <Dialog
                title="Delete skill"
                actions={[
                  {
                    label: "Delete skill",
                    variant: "destructive",
                    disabled: !canDelete,
                    loading: deleteSkill.isPending,
                    onClick: async () => {
                      try {
                        await deleteSkill.mutateAsync({ projectId, name });
                        closeDialog();
                      } catch {
                        // The mutation exposes its error in the dialog.
                      }
                    },
                  },
                ]}
              >
                <Dialog.Body>
                  <p className="text-muted-foreground">
                    This permanently deletes{" "}
                    <code className="ph-no-capture text-foreground font-bold break-all">
                      {name}
                    </code>
                    , including all versions and labels. Requests to fetch any
                    version of this skill will fail. This action cannot be
                    undone.
                  </p>
                  {deleteSkill.error ? (
                    <p
                      role="alert"
                      className="ph-no-capture text-destructive whitespace-pre-wrap"
                    >
                      {deleteSkill.error.message}
                    </p>
                  ) : null}
                </Dialog.Body>
              </Dialog>
            )}
          >
            {({ openDialog }) => (
              <div className="flex min-h-0 flex-1 flex-col">
                {isEmptyProject ? (
                  <EmptySkills
                    canCreate={canDelete}
                    href={`/project/${projectId}/skills/new`}
                    onOpen={() => capture("skills:new_form_open")}
                  />
                ) : (
                  <Table
                    tableName="skills"
                    columns={columns}
                    data={tableData}
                    loadingRowCount={Math.min(paginationState.pageSize, 8)}
                    noResultsMessage="No skills match your search or filters."
                    actions={(skill) => [
                      {
                        type: "item",
                        id: "delete",
                        title: "Delete skill",
                        icon: Trash,
                        variant: "destructive",
                        disabled: canDelete
                          ? undefined
                          : { reason: "You do not have write access" },
                        onClick: () => openDialog(skill.name),
                      },
                    ]}
                  />
                )}
                <PaginationBar
                  totalCount={skills.data?.meta.totalItems ?? null}
                  state={paginationState}
                  onChange={setPagination}
                />
              </div>
            )}
          </DialogController>
        </ResizableFilterLayout>
      </div>
    </DataTableControlsProvider>
  );
}

function NewSkillButton({
  canCreate,
  href,
  onOpen,
}: {
  canCreate: boolean;
  href: string;
  onOpen: () => void;
}) {
  if (!canCreate) {
    return (
      <Button disabled title="You do not have write access">
        <Plus className="mr-1.5 h-4 w-4" /> New skill
      </Button>
    );
  }
  return (
    <Button asChild>
      <Link href={href} onClick={onOpen}>
        <Plus className="mr-1.5 h-4 w-4" /> New skill
      </Link>
    </Button>
  );
}

function EmptySkills({
  canCreate,
  href,
  onOpen,
}: {
  canCreate: boolean;
  href: string;
  onOpen: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-24 text-center">
      <FileCode2 className="text-muted-foreground h-9 w-9" />
      <div>
        <h2 className="font-bold">Create your first skill</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Skills bundle instructions and supporting files into immutable
          versions.
        </p>
      </div>
      {canCreate ? (
        <NewSkillButton canCreate={canCreate} href={href} onOpen={onOpen} />
      ) : null}
    </div>
  );
}
