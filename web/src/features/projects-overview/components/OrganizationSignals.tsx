import { type ReactNode } from "react";
import Link from "next/link";
import { Progress } from "@/src/components/design-system/Progress/Progress";
import { Skeleton } from "@/src/components/ui/skeleton";
import { type OrganizationOverview } from "@/src/features/projects-overview/fns/projectsOverview/buildProjectsOverview";

const numberFormat = new Intl.NumberFormat("en-US");
const percentFormat = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 0,
});
const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

const roleLabels: Record<OrganizationOverview["role"], string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
  VIEWER: "Viewer",
  NONE: "No organization role",
};

function SignalTile({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="bg-card flex min-w-0 flex-col gap-1.5 rounded-lg border p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      {children}
    </div>
  );
}

const getMeterTone = (usage: NonNullable<OrganizationOverview["usage"]>) => {
  if (usage.level === "over-limit" || usage.isIngestionBlocked) {
    return "critical" as const;
  }
  return usage.level === "near-limit"
    ? ("warning" as const)
    : ("default" as const);
};

function UsageTile({
  organizationId,
  usage,
}: {
  organizationId: string;
  usage: NonNullable<OrganizationOverview["usage"]>;
}) {
  const label =
    usage.periodKind === "billing-cycle"
      ? "Usage this billing period"
      : "Usage this month";
  const tone = getMeterTone(usage);

  return (
    <SignalTile label={label}>
      <p className="text-sm">
        <span className="font-mono font-bold">
          {numberFormat.format(usage.units)}
        </span>
        {usage.limit !== null ? (
          <span className="text-muted-foreground">
            {" "}
            / {numberFormat.format(usage.limit)} units
          </span>
        ) : (
          <span className="text-muted-foreground"> units</span>
        )}
      </p>
      {usage.ratio !== null ? (
        <Progress
          value={Math.min(100, Math.round(usage.ratio * 100))}
          tone={tone}
          label="Usage of the plan limit"
        />
      ) : null}
      <p className="text-muted-foreground text-xs">
        {usage.isIngestionBlocked ? (
          <span className="text-dark-red">
            Ingestion is paused until the limit resets or the plan changes.{" "}
          </span>
        ) : null}
        {usage.ratio !== null && !usage.isIngestionBlocked ? (
          <span className={tone === "default" ? undefined : "text-dark-yellow"}>
            {usage.level === "near-limit" ? "Near the plan limit · " : null}
            {usage.level === "over-limit" ? "Over the plan limit · " : null}
            {percentFormat.format(usage.ratio)} used ·{" "}
          </span>
        ) : null}
        {usage.limit === null ? "No limit on this plan · " : null}
        {usage.periodKind === "billing-cycle" ? "Resets " : "Through "}
        {dateFormat.format(usage.periodEnd)}
        {usage.limit !== null ? (
          <>
            {" · "}
            <Link
              href={`/organization/${organizationId}/settings/billing`}
              className="text-primary underline-offset-2 hover:underline"
            >
              Plan & billing
            </Link>
          </>
        ) : null}
      </p>
    </SignalTile>
  );
}

/** The organization's state in a few tiles: usage against the plan, project activity, and the team. */
export function OrganizationSignals({
  organization,
}: {
  organization: OrganizationOverview;
}) {
  const live = organization.projects.filter((project) => !project.isDeleted);
  const counts = {
    receiving: live.filter((project) => project.ingestion.kind === "live")
      .length,
    attention: live.filter((project) => project.attention.length > 0).length,
    notSetUp: live.filter((project) => project.ingestion.kind === "not-set-up")
      .length,
  };

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {organization.usage ? (
        <UsageTile
          organizationId={organization.id}
          usage={organization.usage}
        />
      ) : null}
      <SignalTile label="Projects">
        {organization.loadState === "loading" ? (
          <Skeleton className="h-5 w-40" />
        ) : (
          <p className="text-sm">
            <span className="font-bold">{live.length}</span>
            <span className="text-muted-foreground">
              {" "}
              {live.length === 1 ? "project" : "projects"} · {counts.receiving}{" "}
              receiving data
            </span>
          </p>
        )}
        <p
          className={
            counts.attention > 0
              ? "text-dark-yellow text-xs"
              : "text-muted-foreground text-xs"
          }
        >
          {counts.attention > 0
            ? `${counts.attention} need${counts.attention === 1 ? "s" : ""} attention`
            : "Nothing needs attention"}
          {counts.notSetUp > 0 ? ` · ${counts.notSetUp} not set up` : null}
        </p>
      </SignalTile>
      <SignalTile label="Your access">
        <p className="text-sm">
          <span className="font-bold">{roleLabels[organization.role]}</span>
          {organization.memberCount !== null ? (
            <span className="text-muted-foreground">
              {" "}
              · {organization.memberCount}{" "}
              {organization.memberCount === 1 ? "member" : "members"}
            </span>
          ) : null}
        </p>
        <p className="text-muted-foreground text-xs">
          {organization.usage === null && !organization.isDemo
            ? "Usage is visible to owners and admins"
            : "Roles decide what you can change in each project"}
        </p>
      </SignalTile>
    </div>
  );
}
