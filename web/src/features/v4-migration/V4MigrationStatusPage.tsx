/* eslint-disable @repo/no-null-render */
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import { ArrowRight } from "lucide-react";
import ContainerPage from "@/src/components/layouts/container-page";
import { Card } from "@/src/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import {
  useCopyMigrationPrompt,
  useHasV4MigrationDeadline,
  useV4MigrationTitle,
  V4MigrationDeadlineNote,
  V4MigrationDocsLink,
  V4_MIGRATION_DEADLINE,
} from "@/src/features/v4-migration/V4MigrationContent";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { api } from "@/src/utils/api";
import { formatCompactRelativeTime } from "@/src/utils/dates";
import { V4MigrationStatusDot } from "@/src/features/v4-migration/V4MigrationBadgeContent";
import { useV4UpgradeUiEnabled } from "@/src/features/v4-migration/useV4UpgradeUiEnabled";
import { useOpenV4MigrationPanel } from "@/src/features/v4-migration/hooks/useOpenV4MigrationPanel";
import {
  useAccountV4MigrationData,
  type V4MigrationOrganization,
} from "@/src/features/v4-migration/hooks/useV4MigrationData";
import {
  getProjectMigrationReadiness,
  type MigrationActionState,
  type MigrationCountState,
  type ProjectMigrationReadiness,
  type ProjectMigrationStatus,
} from "@/src/features/v4-migration/migrationData";
import { PARTNER_INTEGRATION_FAQ_URL } from "@/src/features/v4-migration/partnerIntegrationDocs";
import { V4MigrationLoadingState } from "@/src/features/v4-migration/V4MigrationLoadingState";
import { V4PreviewToggleRow } from "@/src/features/events/components/V4SidebarToggle";
import { useReadPath } from "@/src/features/events/hooks/useReadPath";

const V4_DOCS_URL = "https://langfuse.com/docs/v4";
const SDK_UPGRADE_URL =
  "https://langfuse.com/docs/observability/sdk/upgrade-path";
const DATA_MODEL_URL = "https://langfuse.com/docs/observability/data-model";
const OBSERVATIONS_FAQ_URL =
  "https://langfuse.com/faq/all/explore-observations-in-v4";
const API_REFERENCE_URL = "https://api.reference.langfuse.com";

function FaqLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-dark-blue hover:underline"
    >
      {children}
    </a>
  );
}

function AffectedCell({ count }: { count: MigrationCountState }) {
  if (count.status === "loading") {
    return <span className="text-foreground-tertiary">Checking…</span>;
  }
  if (count.status === "error") {
    return <span className="text-foreground-tertiary">Unavailable</span>;
  }
  if (count.count === 0) {
    return <span className="text-foreground-tertiary">0</span>;
  }
  return <span>{count.count}</span>;
}

function MigrationActionCell({ state }: { state: MigrationActionState }) {
  if (state.status === "loading") {
    return <span className="text-foreground-tertiary">Checking…</span>;
  }
  if (state.status === "error") {
    return <span className="text-foreground-tertiary">Unavailable</span>;
  }
  return state.result === "required" ? (
    <span>Update required</span>
  ) : state.result === "sdk_usage_inconclusive" ? (
    <span>Needs review</span>
  ) : (
    <span className="text-foreground-tertiary">Up to date</span>
  );
}

function StatusPill({ readiness }: { readiness: ProjectMigrationReadiness }) {
  // Forced-v3 projects are managed by their integration partner — link the pill
  // straight to the FAQ instead of showing a migration action state.
  if (readiness === "partner-managed") {
    return (
      <a
        href={PARTNER_INTEGRATION_FAQ_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event) => event.stopPropagation()}
        className="bg-muted text-muted-foreground inline-flex w-fit shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap hover:underline"
        title="Upgrade is handled by your integration partner"
      >
        Integration partner
      </a>
    );
  }

  if (readiness !== "action-needed") return null;

  return (
    <span className="bg-light-yellow text-dark-yellow inline-flex w-fit shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap">
      Action needed
    </span>
  );
}

type SortKey =
  | "name"
  | "status"
  | "sdk"
  | "evals"
  | "experiments"
  | "apis"
  | "exports"
  | "lastTrace";
type OrderBy = { column: SortKey; order: "ASC" | "DESC" } | null;

// Header styling and none → DESC → ASC → none sort cycle copied from the
// trace table (DataTable); sorting here is client-side over the static rows.
function SortableHead({
  label,
  column,
  orderBy,
  onSort,
}: {
  label: string;
  column: SortKey;
  orderBy: OrderBy;
  onSort: (column: SortKey) => void;
}) {
  return (
    <TableHead
      className="group cursor-pointer px-2"
      onClick={() => onSort(column)}
    >
      <div className="flex items-center select-none">
        <span className="truncate leading-normal" title={label}>
          {label}
        </span>
        {orderBy?.column === column && (
          <span className="ml-1" title="Sort by this column">
            {orderBy.order === "ASC" ? "▲" : "▼"}
          </span>
        )}
      </div>
    </TableHead>
  );
}

function OrgStatusSection({
  org,
  statusByProjectId,
  lastTraceTimes,
}: {
  org: V4MigrationOrganization;
  statusByProjectId: Map<string, ProjectMigrationStatus>;
  lastTraceTimes: { projectId: string; lastTraceAt: Date }[];
}) {
  const router = useRouter();
  const capture = usePostHogClientCapture();
  const openMigrationPanel = useOpenV4MigrationPanel();

  const openProjectMigration = (
    row: { id: string; name: string },
    readiness: ProjectMigrationReadiness,
  ) => {
    capture("v4_migration:status_row_clicked");
    openMigrationPanel(
      { id: row.id, name: row.name, readiness },
      "status_page_row",
    );
  };

  const handleRowClick = (
    row: { id: string; name: string; status: ProjectMigrationStatus },
    readiness: ProjectMigrationReadiness,
  ) => {
    // Forced-v3 projects have no migration panel — just navigate to the project.
    if (!row.status.forceV3Experience) {
      openProjectMigration(row, readiness);
    }
    router.push(`/project/${row.id}/traces`);
  };

  const [orderBy, setOrderBy] = useState<OrderBy>(null);

  const handleSort = (column: SortKey) => {
    const next: OrderBy =
      orderBy?.column === column
        ? orderBy.order === "DESC"
          ? { column, order: "ASC" }
          : null
        : { column, order: "DESC" };
    capture("table:column_sorting_header_click", {
      column,
      order: next ? next.order : "Disabled",
    });
    setOrderBy(next);
  };

  // The page is a work list: projects with nothing left to do drop out of the
  // table. The summary card still counts them.
  const rows = org.projects.flatMap((project) => {
    const status = statusByProjectId.get(project.id);
    if (!status) return [];
    const readiness = getProjectMigrationReadiness(status);
    if (readiness === "ready") return [];
    const lastTraceAt = lastTraceTimes?.find(
      (trace) => trace.projectId === project.id,
    )?.lastTraceAt;
    return [
      {
        id: project.id,
        name: project.name,
        status,
        readiness,
        lastTraceLabel: lastTraceAt
          ? formatCompactRelativeTime(new Date(lastTraceAt))
          : "—",
        lastTraceSort: lastTraceAt ? new Date(lastTraceAt).getTime() : -1,
      },
    ];
  });

  const sortValue = (
    row: (typeof rows)[number],
    column: SortKey,
  ): string | number => {
    switch (column) {
      case "name":
        return row.name.toLowerCase();
      case "status":
        return {
          unavailable: 0,
          checking: 1,
          "action-needed": 2,
          ready: 3,
          "partner-managed": 4,
        }[row.readiness];
      case "sdk":
        return row.status.sdk.status === "latest"
          ? 5
          : row.status.sdk.status === "otel_realtime"
            ? 5
            : row.status.sdk.status === "no_data"
              ? 5
              : row.status.sdk.status === "legacy"
                ? 4
                : row.status.sdk.status === "otel_header_required"
                  ? 3
                  : row.status.sdk.status === "unknown"
                    ? 2
                    : row.status.sdk.status === "checking"
                      ? 1
                      : 0;
      case "evals":
        return row.status.evals.count;
      case "experiments":
        return row.status.experiments.result === "required"
          ? 2
          : row.status.experiments.result === "sdk_usage_inconclusive"
            ? 1
            : 0;
      case "apis":
        return row.status.apis.count;
      case "exports":
        return row.status.exports.count;
      case "lastTrace":
        return row.lastTraceSort;
    }
  };

  const sortedRows = orderBy
    ? [...rows].sort((a, b) => {
        const va = sortValue(a, orderBy.column);
        const vb = sortValue(b, orderBy.column);
        const cmp =
          typeof va === "string"
            ? va.localeCompare(vb as string)
            : va - (vb as number);
        return orderBy.order === "ASC" ? cmp : -cmp;
      })
    : rows;

  if (rows.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-muted-foreground truncate text-sm" title={org.name}>
        {org.name}
      </h3>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table className="min-w-[60rem] table-auto">
            <TableHeader>
              <TableRow>
                <SortableHead
                  label="Project"
                  column="name"
                  orderBy={orderBy}
                  onSort={handleSort}
                />
                <SortableHead
                  label="Status"
                  column="status"
                  orderBy={orderBy}
                  onSort={handleSort}
                />
                <SortableHead
                  label="SDK"
                  column="sdk"
                  orderBy={orderBy}
                  onSort={handleSort}
                />
                <SortableHead
                  label="Affected Evals"
                  column="evals"
                  orderBy={orderBy}
                  onSort={handleSort}
                />
                <SortableHead
                  label="Affected Experiments"
                  column="experiments"
                  orderBy={orderBy}
                  onSort={handleSort}
                />
                <SortableHead
                  label="Affected APIs"
                  column="apis"
                  orderBy={orderBy}
                  onSort={handleSort}
                />
                <SortableHead
                  label="Affected Exports"
                  column="exports"
                  orderBy={orderBy}
                  onSort={handleSort}
                />
                <SortableHead
                  label="Last trace"
                  column="lastTrace"
                  orderBy={orderBy}
                  onSort={handleSort}
                />
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedRows.map((row) => {
                const { readiness } = row;
                return (
                  <TableRow
                    key={row.id}
                    className="group/row cursor-pointer"
                    onClick={() => handleRowClick(row, readiness)}
                  >
                    <TableCell density="comfortable" className="max-w-48">
                      <Link
                        href={`/project/${row.id}/traces`}
                        className="block truncate font-bold hover:underline"
                        title={row.name}
                        onClick={(event) => {
                          event.stopPropagation();
                          // Forced-v3 projects have no migration panel.
                          if (!row.status.forceV3Experience) {
                            openProjectMigration(row, readiness);
                          }
                        }}
                      >
                        {row.name}
                      </Link>
                    </TableCell>
                    <TableCell
                      density="comfortable"
                      className="overflow-hidden"
                    >
                      <StatusPill readiness={readiness} />
                    </TableCell>
                    <TableCell density="comfortable">
                      {row.status.sdk.status === "latest" ? (
                        <span className="text-foreground-tertiary">Latest</span>
                      ) : row.status.sdk.status === "otel_realtime" ? (
                        <span className="text-foreground-tertiary">
                          OTel real-time
                        </span>
                      ) : row.status.sdk.status === "no_data" ? (
                        <span className="text-foreground-tertiary">
                          No data detected
                        </span>
                      ) : row.status.sdk.status === "checking" ? (
                        <span className="text-foreground-tertiary">
                          Checking…
                        </span>
                      ) : row.status.sdk.status === "unknown" ? (
                        <span className="text-foreground-tertiary">
                          Unknown
                        </span>
                      ) : row.status.sdk.status === "otel_header_required" ? (
                        <span>
                          {row.status.sdk.delayedOtelIngestionCount} OTel header{" "}
                          {row.status.sdk.delayedOtelIngestionCount === 1
                            ? "required"
                            : "issues"}
                        </span>
                      ) : row.status.sdk.status === "error" ? (
                        <span className="text-foreground-tertiary">
                          Unavailable
                        </span>
                      ) : (
                        <span>
                          {row.status.sdk.upgradeRequiredCount} outdated
                        </span>
                      )}
                    </TableCell>
                    <TableCell density="comfortable">
                      <AffectedCell count={row.status.evals} />
                    </TableCell>
                    <TableCell density="comfortable">
                      <MigrationActionCell state={row.status.experiments} />
                    </TableCell>
                    <TableCell density="comfortable">
                      <AffectedCell count={row.status.apis} />
                    </TableCell>
                    <TableCell density="comfortable">
                      <AffectedCell count={row.status.exports} />
                    </TableCell>
                    <TableCell
                      density="comfortable"
                      className="text-muted-foreground truncate"
                      title={row.lastTraceLabel}
                    >
                      {row.lastTraceLabel}
                    </TableCell>
                    <TableCell density="comfortable">
                      <span className="text-dark-blue flex items-center justify-end gap-1 whitespace-nowrap opacity-0 transition-opacity group-hover/row:opacity-100">
                        Review <ArrowRight className="h-3 w-3 shrink-0" />
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

export default function V4MigrationStatusPage() {
  const v4UpgradeUiEnabled = useV4UpgradeUiEnabled();

  if (!v4UpgradeUiEnabled) {
    return null;
  }

  return <V4MigrationStatusPageContent />;
}

function V4MigrationStatusPageContent() {
  const session = useSession();
  const handleCopyPrompt = useCopyMigrationPrompt();
  const hasDeadline = useHasV4MigrationDeadline();
  const title = useV4MigrationTitle();

  const orgs: V4MigrationOrganization[] =
    session.data?.user?.organizations?.map((org) => ({
      id: org.id,
      name: org.name,
      projects: org.projects
        .filter((project) => !project.deletedAt)
        .map((project) => ({ id: project.id, name: project.name })),
    })) ?? [];
  const statusByProjectId = useAccountV4MigrationData({
    organizations: orgs,
    enabled: true,
  });
  // Start the table's remaining data alongside the migration checks. Keeping
  // these queries in the page lets one loading boundary wait for the complete
  // snapshot instead of mounting each organization table with placeholder
  // values that update after its rows become visible.
  const lastTraceQueries = api.useQueries((t) =>
    orgs.map((org) =>
      t.organizations.lastTraceByProject(
        { orgId: org.id },
        { enabled: org.projects.length > 0 },
      ),
    ),
  );

  const faqItems: { q: string; a: ReactNode }[] = [
    {
      q: "Why is this happening?",
      a: (
        <>
          We rebuilt the tracing and evaluation engine around{" "}
          <FaqLink href={DATA_MODEL_URL}>observations</FaqLink>. The new engine
          is real-time and holds up much better at scale.
        </>
      ),
    },
    {
      q: "What's in it for me?",
      a: (
        <>
          Your{" "}
          <FaqLink href={OBSERVATIONS_FAQ_URL}>data shows up instantly</FaqLink>
          , everything loads faster, and you get{" "}
          <FaqLink href={V4_DOCS_URL}>
            features we could not build on the old engine
          </FaqLink>
          , like full-text search, alerting, and observation-level evals.
        </>
      ),
    },
    {
      q: "Do I have to do this?",
      a: (
        <>
          Yes, eventually. The{" "}
          <FaqLink href={SDK_UPGRADE_URL}>old SDKs</FaqLink>, trace-level evals,
          and APIs are frozen and stop working{" "}
          <span className="underline">
            {hasDeadline
              ? `on ${V4_MIGRATION_DEADLINE}`
              : "once your administrator disables the legacy mode"}
          </span>
          . They keep running until then, but we&apos;re no longer fixing bugs
          in them.
        </>
      ),
    },
    {
      q: "How much work is it?",
      a: (
        <>
          Less than you&apos;d think. For most projects it&apos;s{" "}
          <button
            type="button"
            onClick={handleCopyPrompt}
            className="text-dark-blue hover:underline"
          >
            one prompt
          </button>
          : the agent updates your SDK and evals, and migrates your API calls,
          checking with you before it changes anything.
        </>
      ),
    },
    {
      q: "What if I do nothing?",
      a: (
        <>
          <span className="underline">
            {hasDeadline
              ? `On ${V4_MIGRATION_DEADLINE}`
              : "Once your administrator disables the legacy mode"}
          </span>
          , old SDKs stop sending data, and the{" "}
          <FaqLink href={API_REFERENCE_URL}>
            deprecated evals and endpoints
          </FaqLink>{" "}
          start returning errors.
        </>
      ),
    },
  ];

  const totalProjects = orgs.reduce(
    (total, org) => total + org.projects.length,
    0,
  );
  const readiness = orgs.flatMap((org) =>
    org.projects.flatMap((project) => {
      const status = statusByProjectId.get(project.id);
      return status ? [getProjectMigrationReadiness(status)] : [];
    }),
  );
  const actionNeededProjects = readiness.filter(
    (state) => state === "action-needed",
  ).length;
  // Projects whose checks failed are neither clean nor counted as needing
  // action; surface them instead of silently finalizing the count.
  const unavailableProjects = readiness.filter(
    (state) => state === "unavailable",
  ).length;
  // Ready projects are hidden from the org tables, so the page needs its own
  // "nothing left to do" state once every project drops out.
  const listedProjects = readiness.filter((state) => state !== "ready").length;
  const isLoading =
    session.status === "loading" ||
    readiness.some((state) => state === "checking") ||
    orgs.some(
      (org, index) =>
        org.projects.length > 0 &&
        lastTraceQueries[index]?.data === undefined &&
        !lastTraceQueries[index]?.isError,
    );

  if (isLoading) {
    return (
      <ContainerPage headerProps={{ title: "Migration status" }}>
        <V4MigrationLoadingState />
      </ContainerPage>
    );
  }

  return (
    <ContainerPage
      headerProps={{
        title: "Migration status",
      }}
    >
      <div className="flex flex-col gap-6 pt-2 pb-24">
        <Card className="flex min-w-0 flex-col gap-2.5 p-6">
          <p className="text-base font-bold">{title}</p>
          <div className="text-muted-foreground flex flex-col gap-2 text-sm leading-relaxed">
            <p>
              {actionNeededProjects > 0
                ? "Langfuse v4 is here: real-time ingestion and up to 165× faster queries. Complete the action items on each project below to avoid disruption. "
                : "Langfuse v4 is here: real-time ingestion and up to 165× faster queries. "}
              <V4MigrationDocsLink />
            </p>
            {actionNeededProjects > 0 && <V4MigrationDeadlineNote />}
          </div>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            {totalProjects === 0 ? (
              <span className="text-muted-foreground text-sm">
                No active projects
              </span>
            ) : (
              <>
                <span className="text-2xl leading-none font-bold tracking-tight">
                  {actionNeededProjects}
                </span>
                <span className="text-muted-foreground text-sm">
                  of {totalProjects} projects{" "}
                  {actionNeededProjects === 1 ? "needs" : "need"} action
                  {unavailableProjects > 0 &&
                    ` · ${unavailableProjects} could not be checked`}
                </span>
              </>
            )}
          </div>
        </Card>

        {orgs.map((org, index) => (
          <OrgStatusSection
            key={org.id}
            org={org}
            statusByProjectId={statusByProjectId}
            lastTraceTimes={lastTraceQueries[index]?.data ?? []}
          />
        ))}

        {totalProjects > 0 && listedProjects === 0 && (
          <p className="text-muted-foreground flex items-center gap-2.5 text-sm">
            <V4MigrationStatusDot variant="done" />
            All projects are up to date. Nothing to do here.
          </p>
        )}

        <div className="mt-6">
          <p className="text-base font-bold">What&apos;s new in v4</p>
          <div className="flex flex-col gap-6 pt-4">
            <div className="divide-y">
              {faqItems.map(({ q, a }) => (
                <div key={q} className="py-3">
                  <p className="text-sm font-bold">{q}</p>
                  <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
                    {a}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <SwitchBackSection />
      </div>
    </ContainerPage>
  );
}

// User-level v3/v4 UI toggle, the same one the migration side panel shows.
// Hides itself when the session cannot toggle v4 (legacy/events_only write
// mode, post-rollout auto-enrollment).
function SwitchBackSection() {
  const { canToggleV4, isV4 } = useReadPath();
  const hasDeadline = useHasV4MigrationDeadline();

  if (!canToggleV4) {
    return null;
  }

  return (
    <div className="mt-6">
      <p className="text-base font-bold">
        {isV4
          ? "Need to switch back to the legacy UI (v3)?"
          : "Switch back to the latest UI (v4)"}
      </p>
      <div className="flex flex-col gap-4 pt-4">
        {isV4 && (
          <p className="text-muted-foreground text-sm leading-relaxed">
            The features powering the legacy v3 UI will be sunset{" "}
            {hasDeadline
              ? `on ${V4_MIGRATION_DEADLINE}`
              : "once your administrator disables the legacy mode"}
            . We strongly recommend switching to the latest UI (v4) before then.
          </p>
        )}
        <V4PreviewToggleRow />
      </div>
    </div>
  );
}
