import { type ReactNode } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import {
  ChevronRight,
  Copy,
  LibraryBig,
  LifeBuoy,
  TriangleAlert,
} from "lucide-react";
import { useSupportDrawer } from "@/src/features/support-chat/SupportDrawerProvider";
import { Button } from "@/src/components/ui/button";
import { RainbowButton } from "@/src/components/magicui/rainbow-button";
import { Separator } from "@/src/components/ui/separator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/src/components/ui/collapsible";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { cn } from "@/src/utils/tailwind";
import { type ProjectSdkVersionState } from "@/src/features/sdk-version/hooks/useProjectSdkVersionInfo";
import {
  formatSdkVersion,
  type V4MigrationSdkStatus,
} from "@/src/features/v4-migration/sdkVersionStatus";
import { useProjectV4MigrationData } from "@/src/features/v4-migration/hooks/useV4MigrationData";
import {
  V4_MIGRATION_LOOKBACK_DAYS,
  type MigrationCountState,
} from "@/src/features/v4-migration/migrationData";
import { numberFormatter } from "@/src/utils/numbers";

// Single source of truth for the v4-migration copy and content. Both surfaces
// (side panel and modal) render these components — edit copy here only.

const V4_DOCS_URL = "https://langfuse.com/docs/v4";
const SDK_UPGRADE_URL =
  "https://langfuse.com/docs/observability/sdk/upgrade-path";

const CODING_AGENT_PROMPT = `Migrate this project's Langfuse setup to v4:
1. Upgrade the Langfuse SDK to the latest major version. Upgrade guide: ${SDK_UPGRADE_URL}
2. Repoint evals that target trace input/output to observations instead.
3. Replace calls to deprecated APIs (GET /api/public/traces, GET /api/public/sessions, GET /api/public/metrics) with their v4 replacements.
Docs: ${V4_DOCS_URL}`;

// Copies the agent migration prompt to the clipboard with toast + analytics;
// shared by the panel/modal header CTA and the status page.
export function useCopyMigrationPrompt() {
  const capture = usePostHogClientCapture();

  return async () => {
    capture("v4_migration:coding_agent_prompt_copied");
    await navigator.clipboard.writeText(CODING_AGENT_PROMPT);
    showSuccessToast({
      title: "Prompt copied",
      description: "Paste it into Cursor, Codex, or another coding agent.",
    });
  };
}

function Chip({
  children,
  variant,
}: {
  children: ReactNode;
  variant: "warning" | "success";
}) {
  return (
    <span
      className={cn(
        "inline-flex w-fit shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap",
        variant === "warning"
          ? "bg-light-yellow text-dark-yellow"
          : "bg-light-green text-dark-green",
      )}
    >
      {children}
    </span>
  );
}

function Section({
  title,
  chip,
  children,
}: {
  title: string;
  chip: ReactNode;
  children: ReactNode;
}) {
  return (
    <Collapsible>
      <CollapsibleTrigger className="group flex w-full items-center gap-2.5 py-1.5 text-left">
        <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
        <span className="flex-1 text-sm">{title}</span>
        {chip}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="pt-0.5 pb-3.5 pl-6.5">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function MonoValue({ children }: { children: ReactNode }) {
  return <span className="text-foreground font-bold">{children}</span>;
}

function ExternalLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("text-dark-blue hover:underline", className)}
    >
      {children}
    </a>
  );
}

function MigrationCountChip({
  state,
  affectedLabel,
}: {
  state: MigrationCountState;
  affectedLabel: string;
}) {
  if (state.status === "loading") {
    return <Chip variant="warning">Checking</Chip>;
  }
  if (state.status === "error") {
    return <Chip variant="warning">Check failed</Chip>;
  }
  if (state.count === 0) {
    return <Chip variant="success">Up to date</Chip>;
  }
  return (
    <Chip variant="warning">
      {state.count} {affectedLabel}
    </Chip>
  );
}

function V4MigrationSdkSection({
  sdkVersionState,
  status,
}: {
  sdkVersionState: ProjectSdkVersionState;
  status: V4MigrationSdkStatus;
}) {
  const detectedSdk = formatSdkVersion(sdkVersionState.sdkVersion);

  const chip =
    status === "latest" ? (
      <Chip variant="success">Up to date</Chip>
    ) : status === "checking" ? (
      <Chip variant="warning">Checking</Chip>
    ) : status === "unknown" ? (
      <Chip variant="warning">Not detected</Chip>
    ) : status === "error" ? (
      <Chip variant="warning">Check failed</Chip>
    ) : (
      <Chip variant="warning">Legacy</Chip>
    );

  return (
    <Section title="Tracing Instrumentation" chip={chip}>
      <p className="text-muted-foreground text-sm leading-relaxed">
        {status === "checking" ? (
          "Checking the latest traces for this project…"
        ) : status === "unknown" ? (
          <>
            We could not detect an attributed Langfuse SDK in traces from the
            last 7 days. If this project uses one, verify that it is up to date.
          </>
        ) : status === "error" ? (
          "We could not check the latest traces for this project. Try again later."
        ) : status === "latest" ? (
          <>
            This project uses <MonoValue>{detectedSdk}</MonoValue>. Nothing to
            do.
          </>
        ) : (
          <>
            This project uses <MonoValue>{detectedSdk}</MonoValue>.{" "}
            <ExternalLink href={SDK_UPGRADE_URL}>Upgrade the SDK</ExternalLink>{" "}
            for real-time data and the latest tracing experience.
          </>
        )}
      </p>
    </Section>
  );
}

// Title, description, and the primary agent CTA.
export function V4MigrationHeaderContent({
  projectName,
}: {
  projectName?: string;
}) {
  const handleCopyPrompt = useCopyMigrationPrompt();

  return (
    <>
      <p className="mb-1.5 text-lg font-bold">
        {projectName ? (
          <>
            Review v4 migration for{" "}
            <span className="underline">{projectName}</span>
          </>
        ) : (
          "Review v4 migration"
        )}
      </p>
      <p className="text-muted-foreground mb-3 text-sm leading-relaxed">
        Review the items below and update anything still using the legacy data
        model.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <RainbowButton className="w-full" onClick={handleCopyPrompt}>
          <Copy className="mr-1.5 h-4 w-4 shrink-0" />
          <span className="min-w-0 truncate" title="Copy prompt for agents">
            Copy prompt for agents
          </span>
        </RainbowButton>
      </div>
    </>
  );
}

// The "Want to review first?" and "What happens if I don't update" groups.
// onNavigate fires when an internal link is followed so the hosting surface
// (panel or modal) can close itself.
export function V4MigrationDetailsContent({
  onNavigate,
  projectId: projectIdProp,
}: {
  onNavigate?: () => void;
  /** Project the content links point at; falls back to the route project. */
  projectId?: string;
}) {
  const router = useRouter();
  const capture = usePostHogClientCapture();
  const { openWithMode: openSupportDrawerWithMode } = useSupportDrawer();

  const routeProjectId = router.query.projectId;
  const projectId =
    projectIdProp ??
    (typeof routeProjectId === "string" ? routeProjectId : undefined);
  const migrationData = useProjectV4MigrationData({
    projectId,
    enabled: Boolean(projectId),
  });

  const handleEmailEngineer = () => {
    capture("v4_migration:contact_support_clicked");
    onNavigate?.();
    openSupportDrawerWithMode("form", { topic: "V4 Migration" });
  };
  const evalsUrl =
    typeof projectId === "string" ? `/project/${projectId}/evals` : undefined;
  const integrationsUrl =
    typeof projectId === "string"
      ? `/project/${projectId}/settings/integrations`
      : undefined;

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-base font-bold">
          <LibraryBig className="h-4 w-4" /> Want to review first?
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild className="min-w-0 flex-1">
            <a href={V4_DOCS_URL} target="_blank" rel="noopener noreferrer">
              <span className="min-w-0 truncate" title="Documentation">
                Documentation
              </span>
            </a>
          </Button>
          <Button variant="outline" asChild className="min-w-0 flex-1">
            <Link href="/v4-migration" onClick={onNavigate}>
              <span className="min-w-0 truncate" title="Check migration status">
                Check migration status
              </span>
            </Link>
          </Button>
        </div>
      </div>

      <Separator />

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-base font-bold">
          <TriangleAlert className="h-4 w-4" /> What happens if I don&apos;t
          update?
        </div>
        <p className="text-muted-foreground text-sm">
          Some features will stop working after{" "}
          <span className="text-dark-yellow">Oct 1</span>.
        </p>
        <div>
          <V4MigrationSdkSection
            sdkVersionState={migrationData.sdkVersionState}
            status={migrationData.sdkStatus}
          />

          <Section
            title="Evals"
            chip={
              <MigrationCountChip
                state={migrationData.evals}
                affectedLabel="deprecated"
              />
            }
          >
            {migrationData.evals.status === "loading" ? (
              <p className="text-muted-foreground text-sm">
                Checking configured evals…
              </p>
            ) : migrationData.evals.status === "error" ? (
              <p className="text-muted-foreground text-sm">
                We could not check configured evals. Try again later.
              </p>
            ) : migrationData.evals.count > 0 ? (
              <>
                <p className="text-muted-foreground mb-2 text-sm">
                  {migrationData.evals.count} configured{" "}
                  {migrationData.evals.count === 1
                    ? "eval targets"
                    : "evals target"}{" "}
                  trace input/output, which stops running{" "}
                  <span className="text-dark-yellow">Oct 1</span>. Point{" "}
                  {migrationData.evals.count === 1 ? "it" : "them"} at an
                  observation instead.
                </p>
                {evalsUrl ? (
                  <Link
                    href={evalsUrl}
                    onClick={onNavigate}
                    className="text-dark-blue text-sm hover:underline"
                  >
                    Review trace-level evals
                  </Link>
                ) : null}
              </>
            ) : (
              <p className="text-muted-foreground text-sm">
                No configured trace-level evals detected.
              </p>
            )}
          </Section>

          <Section
            title="Legacy APIs"
            chip={
              <MigrationCountChip
                state={migrationData.apis}
                affectedLabel="deprecated"
              />
            }
          >
            {migrationData.apis.status === "loading" ? (
              <p className="text-muted-foreground text-sm">
                Checking public API usage…
              </p>
            ) : migrationData.apis.status === "error" ? (
              <p className="text-muted-foreground text-sm">
                We could not check public API usage. Try again later.
              </p>
            ) : migrationData.apiUsage.length > 0 ? (
              <>
                <p className="text-muted-foreground mb-2 text-sm">
                  You&apos;ve called these deprecated endpoints in the last{" "}
                  {V4_MIGRATION_LOOKBACK_DAYS} days. They stop working{" "}
                  <span className="text-dark-yellow">Oct 1</span>; the{" "}
                  <ExternalLink href="https://api.reference.langfuse.com">
                    new APIs
                  </ExternalLink>{" "}
                  cover the same data.
                </p>
                <div className="flex flex-col">
                  {migrationData.apiUsage.map((usage) => (
                    <div
                      key={usage.endpoint}
                      className="flex items-center justify-between gap-2 py-0.5"
                    >
                      <ExternalLink
                        href="https://api.reference.langfuse.com"
                        className="text-sm"
                      >
                        {usage.endpoint}
                      </ExternalLink>
                      <span className="text-muted-foreground text-xs whitespace-nowrap">
                        {numberFormatter(usage.count, 0, 2)} calls
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-muted-foreground text-sm">
                No legacy public API usage detected in the last{" "}
                {V4_MIGRATION_LOOKBACK_DAYS} days.
              </p>
            )}
          </Section>

          <Section
            title="Legacy Integrations"
            chip={
              <MigrationCountChip
                state={migrationData.exports}
                affectedLabel="deprecated"
              />
            }
          >
            {migrationData.exports.status === "loading" ? (
              <p className="text-muted-foreground text-sm">
                Checking integrations…
              </p>
            ) : migrationData.exports.status === "error" ? (
              <p className="text-muted-foreground text-sm">
                We could not check integrations. Try again later.
              </p>
            ) : migrationData.legacyIntegrations.length > 0 ? (
              <>
                <p className="text-muted-foreground mb-2 text-sm">
                  These exports still read from the old data source. Switching
                  them over can change what downstream consumers receive, so
                  worth a quick check.
                </p>
                <div className="flex flex-col">
                  {migrationData.legacyIntegrations.map((name) => (
                    <div key={name} className="flex items-center py-0.5">
                      {integrationsUrl ? (
                        <Link
                          href={integrationsUrl}
                          onClick={onNavigate}
                          className="text-dark-blue text-sm hover:underline"
                        >
                          {name}
                        </Link>
                      ) : (
                        <span className="text-sm">{name}</span>
                      )}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-muted-foreground text-sm">
                No legacy integration exports detected.
              </p>
            )}
          </Section>
        </div>
      </div>

      <Separator />

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-base font-bold">
          <LifeBuoy className="h-4 w-4" /> Contact us
        </div>
        <p className="text-muted-foreground text-sm">
          Need a hand with the update? We&apos;re here to help!
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild className="min-w-0 flex-1">
            <a
              href="https://cal.com/team/langfuse/welcome-to-langfuse"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => capture("v4_migration:contact_book_call_clicked")}
            >
              <span className="min-w-0 truncate" title="Book a call">
                Book a call
              </span>
            </a>
          </Button>
          <Button
            variant="outline"
            className="min-w-0 flex-1"
            onClick={handleEmailEngineer}
          >
            <span className="min-w-0 truncate" title="Email an Engineer">
              Email an Engineer
            </span>
          </Button>
        </div>
      </div>
    </>
  );
}
