import Link from "next/link";
import { useSession } from "next-auth/react";
import { ChevronRight, Copy, LifeBuoy, TriangleAlert } from "lucide-react";
import Page from "@/src/components/layouts/page";
import { Button } from "@/src/components/ui/button";
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
import {
  Chip,
  useCopyMigrationPrompt,
} from "@/src/features/v4-migration/V4MigrationContent";
import { api } from "@/src/utils/api";
import { formatCompactRelativeTime } from "@/src/utils/dates";

const V4_DOCS_URL = "https://langfuse.com/docs/v4";

// Demo-only per-project statuses, assigned deterministically by global project
// index until backend per-project detection exists. Real org/project names and
// last-trace times come from the session and the lastTraceByProject endpoint.
const DEMO_STATUSES = [
  {
    upToDate: false,
    sdk: "Legacy",
    evals: "2 deprecated",
    apis: "3 endpoints",
    exports: "PostHog",
  },
  {
    upToDate: false,
    sdk: "Legacy",
    evals: "—",
    apis: "1 endpoint",
    exports: "—",
  },
  {
    upToDate: true,
    sdk: "Up to date",
    evals: "—",
    apis: "—",
    exports: "—",
  },
] as const;

const FAQ = [
  {
    q: "Why is this happening?",
    a: "We moved to a new evaluation and tracing engine that runs on observations. It's real-time and scales better than the trace-based model.",
  },
  {
    q: "What's in it for me?",
    a: "Live data with no delay, faster charts and APIs, plus new search, alerting, and observation-level evals that only exist on v4.",
  },
  {
    q: "Do I have to do this?",
    a: "Yes. Legacy SDKs, trace-level evals, and the old APIs are frozen now and stop working Oct 1. Until then they keep running but are no longer maintained.",
  },
  {
    q: "How much work is it?",
    a: "For most projects, one prompt. The agent updates your SDK, repoints your evals, and migrates your API calls, and asks for approval before changing anything.",
  },
  {
    q: "What if I do nothing?",
    a: "After Oct 1, data stops flowing on the legacy SDK and deprecated evals and endpoints return errors.",
  },
] as const;

type OrgWithProjects = {
  id: string;
  name: string;
  projects: { id: string; name: string }[];
};

function OrgStatusSection({
  org,
  statusByProjectId,
}: {
  org: OrgWithProjects;
  statusByProjectId: Map<string, (typeof DEMO_STATUSES)[number]>;
}) {
  const handleCopyPrompt = useCopyMigrationPrompt();
  const { data: lastTraceTimes } =
    api.organizations.lastTraceByProject.useQuery(
      { orgId: org.id },
      { enabled: org.projects.length > 0 },
    );

  if (org.projects.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">{org.name}</h3>
      <div className="rounded-md border">
        <Table className="[&_td]:px-3 [&_td]:py-2.5 [&_th]:px-3">
          <TableHeader>
            <TableRow>
              <TableHead>Project</TableHead>
              <TableHead>SDK</TableHead>
              <TableHead>Evals</TableHead>
              <TableHead>APIs</TableHead>
              <TableHead>Exports</TableHead>
              <TableHead>Last trace</TableHead>
              <TableHead className="w-36" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {org.projects.map((project) => {
              const status = statusByProjectId.get(project.id);
              const lastTraceAt = lastTraceTimes?.find(
                (t) => t.projectId === project.id,
              )?.lastTraceAt;
              if (!status) return null;
              return (
                <TableRow key={project.id} className="group/row">
                  <TableCell className="max-w-48">
                    <Link
                      href={`/project/${project.id}`}
                      className="block truncate font-medium hover:underline"
                      title={project.name}
                    >
                      {project.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Chip variant={status.upToDate ? "success" : "warning"}>
                      {status.sdk}
                    </Chip>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {status.evals}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {status.apis}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {status.exports}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                    {lastTraceAt
                      ? formatCompactRelativeTime(new Date(lastTraceAt))
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      {!status.upToDate && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleCopyPrompt}
                          className="translate-x-2 opacity-0 transition-all duration-200 group-hover/row:translate-x-0 group-hover/row:opacity-100 focus-visible:translate-x-0 focus-visible:opacity-100"
                        >
                          <Copy className="mr-1 h-3 w-3" />
                          Copy prompt
                        </Button>
                      )}
                      <Link
                        href={`/project/${project.id}`}
                        aria-label={`Open project ${project.name}`}
                        className="inline-flex"
                      >
                        <ChevronRight className="text-muted-foreground h-4 w-4" />
                      </Link>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// Account-wide migration status: every organization and project the user
// belongs to, with per-project readiness. Statuses are demo data (see
// DEMO_STATUSES); names and last-trace times are real.
export default function V4MigrationStatusPage() {
  const session = useSession();
  const { setOpen: setSupportDrawerOpen } = useSupportDrawer();
  const { setOpen: setMigrationPanelOpen } = useV4MigrationPanel();
  const { setOpen: setAiAgentOpen } = useInAppAiAgent();

  const handleOpenSupport = () => {
    setAiAgentOpen(false);
    setMigrationPanelOpen(false);
    setSupportDrawerOpen(true);
  };

  const orgs: OrgWithProjects[] =
    session.data?.user?.organizations?.map((org) => ({
      id: org.id,
      name: org.name,
      projects: org.projects.map((p) => ({ id: p.id, name: p.name })),
    })) ?? [];

  // Deterministic demo status per project, stable across renders and orgs.
  const statusByProjectId = new Map<string, (typeof DEMO_STATUSES)[number]>();
  orgs
    .flatMap((org) => org.projects)
    .forEach((project, i) => {
      statusByProjectId.set(project.id, DEMO_STATUSES[i % 3]);
    });

  const totalProjects = statusByProjectId.size;
  const readyProjects = [...statusByProjectId.values()].filter(
    (s) => s.upToDate,
  ).length;
  const projectsNeedingAction = totalProjects - readyProjects;
  const allReady = totalProjects > 0 && projectsNeedingAction === 0;

  return (
    <Page
      headerProps={{
        title: "Migration status",
        actionButtonsRight: (
          <>
            <Button variant="outline" asChild>
              <a href={V4_DOCS_URL} target="_blank" rel="noopener noreferrer">
                Docs
              </a>
            </Button>
            <Button variant="outline" onClick={handleOpenSupport}>
              <LifeBuoy className="mr-1.5 h-4 w-4" />
              Support
            </Button>
          </>
        ),
      }}
      scrollable
    >
      <div className="flex max-w-4xl flex-col gap-6 p-4">
        <div className="flex flex-col gap-3">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-2xl leading-none font-semibold">
                {readyProjects}{" "}
                <span className="text-muted-foreground text-lg font-normal">
                  / {totalProjects}
                </span>
              </p>
              <p className="text-muted-foreground mt-1.5 text-sm">
                projects ready
              </p>
            </div>
            <p className="text-muted-foreground text-sm">
              Finish by <span className="text-dark-yellow">Oct 1</span>
            </p>
          </div>
          {allReady ? (
            <div className="bg-light-green text-dark-green flex items-center gap-2 rounded-md p-3 text-sm">
              You&apos;re all set — every project is on v4.
            </div>
          ) : (
            <div className="bg-light-yellow flex items-center gap-2 rounded-md p-3">
              <TriangleAlert className="text-dark-yellow h-4 w-4 shrink-0" />
              <p className="text-dark-yellow text-sm">
                {projectsNeedingAction}{" "}
                {projectsNeedingAction === 1 ? "project" : "projects"} still use
                deprecated features. Live data on those is ~15 minutes behind.
              </p>
            </div>
          )}
        </div>

        {orgs.map((org) => (
          <OrgStatusSection
            key={org.id}
            org={org}
            statusByProjectId={statusByProjectId}
          />
        ))}

        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold">Frequently asked</p>
          <div className="divide-y">
            {FAQ.map(({ q, a }) => (
              <div key={q} className="py-3">
                <p className="text-sm font-medium">{q}</p>
                <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
                  {a}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Page>
  );
}
