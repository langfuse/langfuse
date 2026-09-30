import { useMemo } from "react";
import { useQueryOrganization } from "@/src/features/organizations/hooks";
import { type OrganizationIngestionOverview } from "../components/OrgOverviewGraph/OrgOverviewGraph";

export function useOrganizationIngestionOverview(organizationId: string) {
  const organization = useQueryOrganization();

  return useMemo(() => {
    if (!organization || organization.id !== organizationId) return undefined;

    // Placeholder metrics only: replace this hook with the organization API query.
    const projects: OrganizationIngestionOverview["projects"] =
      organization.projects
        .filter((project) => !project.deletedAt)
        .map((project, index) => {
          const variant = index % 3;
          const status = (["active", "stopped", "new"] as const)[variant]!;
          const events = [
            { current: 12000, previous: 10000, changePct: 20 },
            { current: 0, previous: 200, changePct: -100 },
            { current: 2883, previous: 0, changePct: null },
          ][variant]!;
          const apiScores = [
            { current: 20, previous: 20, changePct: 0 },
            { current: 0, previous: 0, changePct: null },
            { current: 3, previous: 0, changePct: null },
          ][variant]!;
          const lastSeen =
            variant === 1 ? "2026-09-20T12:00:00Z" : "2026-09-29T23:30:00Z";
          const clients: OrganizationIngestionOverview["projects"][number]["clients"] =
            [
              {
                clientType: variant === 2 ? "custom_otel" : "langfuse_sdk",
                sdkName: variant === 2 ? "custom-js" : "langfuse-js",
                sdkVersion: variant === 2 ? "1.0.0" : "4.0.0",
                canonicalSdkName: variant === 2 ? null : "javascript",
                sdkUpgradeStatus: variant === 2 ? "unsupported_sdk" : "current",
                ingestionPaths: ["otel"],
                publicKey: null,
                status,
                events:
                  variant === 0
                    ? { current: 8000, previous: 6000, changePct: 33.33 }
                    : events,
                scores: apiScores,
                lastSeen,
              },
            ];
          if (variant === 0) {
            clients.push({
              clientType: "langfuse_sdk",
              sdkName: "langfuse-python",
              sdkVersion: "3.9.0",
              canonicalSdkName: "python",
              sdkUpgradeStatus: "outdated_major",
              ingestionPaths: ["otel"],
              publicKey: null,
              status: "active",
              events: { current: 4000, previous: 4000, changePct: 0 },
              scores: { current: 0, previous: 0, changePct: null },
              lastSeen: "2026-09-29T22:00:00Z",
            });
          }
          return {
            projectId: project.id,
            projectName: project.name,
            status,
            events,
            scores: {
              ...(variant === 0
                ? { current: 40, previous: 30, changePct: 33.33 }
                : apiScores),
              bySource: {
                API: apiScores,
                EVAL:
                  variant === 0
                    ? { current: 10, previous: 5, changePct: 100 }
                    : { current: 0, previous: 0, changePct: null },
                ANNOTATION:
                  variant === 0
                    ? { current: 10, previous: 5, changePct: 100 }
                    : { current: 0, previous: 0, changePct: null },
              },
            },
            lastSeen,
            clients,
          };
        });

    const totals: OrganizationIngestionOverview["totals"] = {
      events: { current: 0, previous: 0, changePct: null },
      scores: { current: 0, previous: 0, changePct: null },
      projectsByStatus: { active: 0, new: 0, stopped: 0, idle: 0 },
    };
    for (const project of projects) {
      totals.projectsByStatus[project.status]++;
      for (const metric of ["events", "scores"] as const) {
        totals[metric].current += project[metric].current;
        totals[metric].previous += project[metric].previous;
      }
    }
    for (const metric of ["events", "scores"] as const) {
      const { current, previous } = totals[metric];
      totals[metric].changePct =
        previous === 0 ? null : ((current - previous) / previous) * 100;
    }

    const data: OrganizationIngestionOverview = {
      windows: {
        current: { from: "2026-09-23T00:00:00Z", to: "2026-09-30T00:00:00Z" },
        previous: { from: "2026-09-16T00:00:00Z", to: "2026-09-23T00:00:00Z" },
      },
      totals,
      projects,
    };
    return data;
  }, [organization, organizationId]);
}
