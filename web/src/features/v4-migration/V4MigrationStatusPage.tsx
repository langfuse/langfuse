import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ArrowRight, Copy } from "lucide-react";
import ContainerPage from "@/src/components/layouts/container-page";
import { RainbowButton } from "@/src/components/magicui/rainbow-button";
import { Card } from "@/src/components/ui/card";
import { useSupportDrawer } from "@/src/features/support-chat/SupportDrawerProvider";
import { useV4MigrationPanel } from "@/src/features/v4-migration/V4MigrationPanelProvider";
import { useInAppAiAgent } from "@/src/ee/features/in-app-agent/components/InAppAiAgentProvider";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import { useCopyMigrationPrompt } from "@/src/features/v4-migration/V4MigrationContent";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { api } from "@/src/utils/api";
import { formatCompactRelativeTime } from "@/src/utils/dates";
import { cn } from "@/src/utils/tailwind";
import { useV4UpgradeUiEnabled } from "@/src/features/v4-migration/useV4UpgradeUiEnabled";

const V4_DOCS_URL = "https://langfuse.com/docs/v4";
const SDK_UPGRADE_URL =
  "https://langfuse.com/docs/observability/sdk/upgrade-path";
const DATA_MODEL_URL = "https://langfuse.com/docs/observability/data-model";
const OBSERVATIONS_FAQ_URL =
  "https://langfuse.com/faq/all/explore-observations-in-v4";
const API_REFERENCE_URL = "https://api.reference.langfuse.com";

// Demo-only per-project statuses until backend per-project detection exists.
// Affected counts per category: a number is the count of affected items
// (0 = feature in use, nothing affected), null = feature not used at all.
type DemoStatus = {
  sdkUpToDate: boolean;
  evals: number | null;
  apis: number | null;
  exports: number | null;
};

const DEMO_STATUSES: DemoStatus[] = [
  { sdkUpToDate: false, evals: 2, apis: 3, exports: 2 },
  { sdkUpToDate: false, evals: 0, apis: 1, exports: null },
  { sdkUpToDate: true, evals: 0, apis: 0, exports: 0 },
];

const isReady = (s: DemoStatus) =>
  s.sdkUpToDate && !(s.evals ?? 0) && !(s.apis ?? 0) && !(s.exports ?? 0);

// Dummy projects appended to the first organization so every cell state is
// visible while iterating on the design. Remove with the backend work.
const DEMO_EXTRA_PROJECTS: {
  id: string;
  name: string;
  status: DemoStatus;
  lastTraceLabel: string;
  lastTraceOffsetMs: number | null;
}[] = [
  {
    id: "dummy-prod-agent-eu",
    name: "prod-agent-eu",
    status: { sdkUpToDate: false, evals: 4, apis: 2, exports: 1 },
    lastTraceLabel: "3m ago",
    lastTraceOffsetMs: 3 * 60 * 1000,
  },
  {
    id: "dummy-staging",
    name: "staging",
    status: { sdkUpToDate: false, evals: null, apis: null, exports: null },
    lastTraceLabel: "2d ago",
    lastTraceOffsetMs: 2 * 24 * 60 * 60 * 1000,
  },
  {
    id: "dummy-ml-pipeline",
    name: "ml-pipeline",
    status: { sdkUpToDate: true, evals: 3, apis: 0, exports: 1 },
    lastTraceLabel: "1h ago",
    lastTraceOffsetMs: 60 * 60 * 1000,
  },
  {
    id: "dummy-chatbot-poc",
    name: "chatbot-poc",
    status: { sdkUpToDate: true, evals: null, apis: null, exports: null },
    lastTraceLabel: "—",
    lastTraceOffsetMs: null,
  },
];

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

type OrgWithProjects = {
  id: string;
  name: string;
  projects: { id: string; name: string }[];
};

// Cell for affected-count columns: amber count when action is needed, muted 0
// otherwise (in-use-but-fine and not-used render the same; the per-project
// panel carries the distinction).
function AffectedCell({ count }: { count: number | null }) {
  if (!count) {
    return <span className="text-foreground-tertiary">0</span>;
  }
  return <span>{count}</span>;
}

function StatusPill({ ready }: { ready: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap",
        ready
          ? "bg-light-green text-dark-green"
          : "bg-light-yellow text-dark-yellow",
      )}
    >
      {ready ? "Ready" : "Action needed"}
    </span>
  );
}

type SortKey =
  | "name"
  | "status"
  | "sdk"
  | "evals"
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
  includeDemoProjects = false,
}: {
  org: OrgWithProjects;
  statusByProjectId: Map<string, DemoStatus>;
  includeDemoProjects?: boolean;
}) {
  const capture = usePostHogClientCapture();
  const { openForProject } = useV4MigrationPanel();
  const { setOpen: setSupportDrawerOpen } = useSupportDrawer();
  const { setOpen: setAiAgentOpen } = useInAppAiAgent();
  const { data: lastTraceTimes } =
    api.organizations.lastTraceByProject.useQuery(
      { orgId: org.id },
      { enabled: org.projects.length > 0 },
    );

  const handleRowClick = (row: {
    id: string;
    name: string;
    isDummy: boolean;
  }) => {
    // Demo placeholder rows have no backing project to open a panel for.
    if (row.isDummy) return;
    capture("v4_migration:status_row_clicked");
    setAiAgentOpen(false);
    setSupportDrawerOpen(false);
    openForProject({ id: row.id, name: row.name });
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

  const rows = [
    ...org.projects.map((project) => {
      const lastTraceAt = lastTraceTimes?.find(
        (t) => t.projectId === project.id,
      )?.lastTraceAt;
      return {
        id: project.id,
        name: project.name,
        status: statusByProjectId.get(project.id),
        lastTraceLabel: lastTraceAt
          ? formatCompactRelativeTime(new Date(lastTraceAt))
          : "—",
        lastTraceSort: lastTraceAt ? new Date(lastTraceAt).getTime() : -1,
        isDummy: false,
      };
    }),
    ...(includeDemoProjects
      ? DEMO_EXTRA_PROJECTS.map((p) => ({
          ...p,
          lastTraceSort:
            p.lastTraceOffsetMs === null
              ? -1
              : Date.now() - p.lastTraceOffsetMs,
          isDummy: true,
        }))
      : []),
  ];

  const sortValue = (
    row: (typeof rows)[number],
    column: SortKey,
  ): string | number => {
    switch (column) {
      case "name":
        return row.name.toLowerCase();
      case "status":
        return row.status && isReady(row.status) ? 1 : 0;
      case "sdk":
        return row.status?.sdkUpToDate ? 1 : 0;
      case "evals":
        return row.status?.evals ?? 0;
      case "apis":
        return row.status?.apis ?? 0;
      case "exports":
        return row.status?.exports ?? 0;
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
        <Table>
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
              if (!row.status) return null;
              const ready = isReady(row.status);
              return (
                <TableRow
                  key={row.id}
                  className={cn("group/row", !row.isDummy && "cursor-pointer")}
                  onClick={() => handleRowClick(row)}
                >
                  <TableCell density="comfortable" className="max-w-48">
                    {row.isDummy ? (
                      <span
                        className="block truncate font-bold"
                        title={row.name}
                      >
                        {row.name}
                      </span>
                    ) : (
                      <Link
                        href={`/project/${row.id}`}
                        className="block truncate font-bold hover:underline"
                        title={row.name}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {row.name}
                      </Link>
                    )}
                  </TableCell>
                  <TableCell density="comfortable" className="overflow-hidden">
                    <StatusPill ready={ready} />
                  </TableCell>
                  <TableCell density="comfortable">
                    {row.status.sdkUpToDate ? (
                      <span className="text-foreground-tertiary">Latest</span>
                    ) : (
                      <span>Legacy</span>
                    )}
                  </TableCell>
                  <TableCell density="comfortable">
                    <AffectedCell count={row.status.evals} />
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
                      Update <ArrowRight className="h-3 w-3 shrink-0" />
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

// Account-wide migration status: every organization and project the user
// belongs to, with per-project readiness. Statuses are demo data (see
// DEMO_STATUSES / DEMO_EXTRA_PROJECTS); names and last-trace times are real
// for the user's own projects.
export default function V4MigrationStatusPage() {
  const session = useSession();
  const handleCopyPrompt = useCopyMigrationPrompt();
  const v4UpgradeUiEnabled = useV4UpgradeUiEnabled();

  // Same eligibility gate as every other v4-migration surface; the page is
  // reachable by URL regardless of whether the nav entry is shown.
  if (!v4UpgradeUiEnabled) {
    return null;
  }

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
          and APIs are frozen and stop working on{" "}
          <span className="underline">Oct 1</span>. They keep running until
          then, but we&apos;re no longer fixing bugs in them.
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
          : the agent updates your SDK, repoints your evals, and migrates your
          API calls, checking with you before it changes anything.
        </>
      ),
    },
    {
      q: "What if I do nothing?",
      a: (
        <>
          On <span className="underline">Oct 1</span>, old SDKs stop sending
          data, and the{" "}
          <FaqLink href={API_REFERENCE_URL}>
            deprecated evals and endpoints
          </FaqLink>{" "}
          start returning errors.
        </>
      ),
    },
  ];

  const orgs: OrgWithProjects[] =
    session.data?.user?.organizations?.map((org) => ({
      id: org.id,
      name: org.name,
      projects: org.projects.map((p) => ({ id: p.id, name: p.name })),
    })) ?? [];

  // Deterministic demo status per project, stable across renders and orgs.
  const statusByProjectId = new Map<string, DemoStatus>();
  orgs
    .flatMap((org) => org.projects)
    .forEach((project, i) => {
      statusByProjectId.set(
        project.id,
        DEMO_STATUSES[i % DEMO_STATUSES.length],
      );
    });

  const allStatuses = [
    ...statusByProjectId.values(),
    ...DEMO_EXTRA_PROJECTS.map((p) => p.status),
  ];
  const totalProjects = allStatuses.length;
  const readyProjects = allStatuses.filter(isReady).length;
  const projectsNeedingAction = totalProjects - readyProjects;
  const shouldShowUpdateAllButton =
    totalProjects === 0 || projectsNeedingAction > 0;

  return (
    <ContainerPage
      headerProps={{
        title: "Migration status",
      }}
    >
      <div className="flex flex-col gap-6 pt-2 pb-24">
        <Card className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4 p-6">
          <div className="flex min-w-0 flex-col gap-2.5">
            <p className="text-base font-bold">
              Langfuse v4 is here. Real-time and up to 165× faster
            </p>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-2xl leading-none font-bold tracking-tight">
                {readyProjects}
              </span>
              <span className="text-muted-foreground text-sm">
                of {totalProjects} projects migrated
              </span>
            </div>
          </div>
          {shouldShowUpdateAllButton && (
            <RainbowButton onClick={handleCopyPrompt}>
              <Copy className="mr-1.5 h-4 w-4 shrink-0" />
              <span className="min-w-0 truncate" title="Update all with agents">
                Update all with agents
              </span>
            </RainbowButton>
          )}
        </Card>

        {orgs.map((org, i) => (
          <OrgStatusSection
            key={org.id}
            org={org}
            statusByProjectId={statusByProjectId}
            includeDemoProjects={i === 0}
          />
        ))}

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
      </div>
    </ContainerPage>
  );
}
