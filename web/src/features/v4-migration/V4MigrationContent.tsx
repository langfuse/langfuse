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

// Demo-only copy variants: all data below is hardcoded until the backend can
// report a project's actual SDK, eval, API, and integration setup. Which
// variant renders is picked by the DEMO_SDK_CASE/DEMO_EVAL_CASE constants.
const SDK_CASES = [
  { label: "Pre-OTel SDK (JS 3.x, Python 2.x)", upToDate: false },
  { label: "Direct API, pre-OTel (no SDK)", upToDate: false },
  { label: "Direct API, OTel + write header (no SDK)", upToDate: true },
  { label: "Direct API, OTel, no header (no SDK)", upToDate: false },
  { label: "OTel SDK (JS 4, Python 3)", upToDate: false },
  { label: "v4 SDK (JS 5, Python 4)", upToDate: false },
  { label: "Latest v4 SDK (JS 5.x, Python 4.x)", upToDate: true },
] as const;

const EVAL_CASES = [
  { label: "Targets spans, new SDK", deprecated: false },
  { label: "Targets spans, old SDK", deprecated: false },
  { label: "Targets trace I/O, new SDK", deprecated: true },
  { label: "Targets trace I/O, old SDK", deprecated: true },
] as const;

const DEMO_SDK_CASE = 1 as number;
const DEMO_EVAL_CASE = 3 as number;

const LEGACY_APIS = [
  { endpoint: "GET /api/public/traces", volume: "8,680 / week" },
  { endpoint: "GET /api/public/sessions", volume: "2,170 / week" },
  { endpoint: "GET /api/public/metrics", volume: "315 / week" },
];

const LEGACY_INTEGRATIONS = ["PostHog", "Mixpanel", "Blob Storage"];

const DEPRECATED_EVALS = ["hallucination-check", "answer-relevance"];

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

export function Chip({
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

function SdkCaseCopy({ sdkCase }: { sdkCase: number }) {
  switch (sdkCase) {
    case 1:
      return (
        <>
          This project is on <MonoValue>Python v2.x</MonoValue>, which is a few
          major versions behind. Upgrading gets you real-time data.
        </>
      );
    case 2:
      return (
        <>
          You&apos;re sending traces via the legacy ingestion API directly.
          Consider switching to the{" "}
          <ExternalLink href={SDK_UPGRADE_URL}>Langfuse SDK</ExternalLink> or{" "}
          <ExternalLink href={V4_DOCS_URL}>OTel API</ExternalLink> to get
          real-time data.
        </>
      );
    case 4:
      return (
        <>
          This project sends traces via OTel, which adds a{" "}
          <span className="text-dark-yellow">~15 min</span> delay. To see
          real-time data, update your OTel instrumentation to include the write
          header.
        </>
      );
    case 5:
      return (
        <>
          This project uses <MonoValue>SDK v3</MonoValue>, which adds a{" "}
          <span className="text-dark-yellow">~15 min</span> delay. Update for
          real-time data. Requires changes to your instrumentation to adjust how
          traces are sent.
        </>
      );
    case 6:
      return (
        <>
          This project uses <MonoValue>SDK v4</MonoValue>, upgrade for a better
          tracing experience in the UI.
        </>
      );
    case 7:
      return <>You&apos;re on the latest SDK. Nothing to do.</>;
    default:
      return null;
  }
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
            Migrate <span className="underline">{projectName}</span> to v4
          </>
        ) : (
          "Migrate to v4"
        )}
      </p>
      <p className="text-muted-foreground mb-3 text-sm leading-relaxed">
        Some of your setup is outdated.
        {DEMO_SDK_CASE !== 3 && (
          <>
            {" "}
            Live data is currently{" "}
            <span className="text-dark-yellow">15 minutes behind</span>.
          </>
        )}{" "}
        Update for faster performance.
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

  const handleEmailEngineer = () => {
    capture("v4_migration:contact_support_clicked");
    onNavigate?.();
    openSupportDrawerWithMode("form", { topic: "V4 Migration" });
  };
  const evalsUrl =
    typeof projectId === "string" ? `/project/${projectId}/evals` : undefined;

  const evalDeprecated = EVAL_CASES[DEMO_EVAL_CASE - 1].deprecated;

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
          {DEMO_SDK_CASE !== 3 && (
            <Section
              title="Tracing Instrumentation"
              chip={
                SDK_CASES[DEMO_SDK_CASE - 1].upToDate ? (
                  <Chip variant="success">Up to date</Chip>
                ) : (
                  <Chip variant="warning">Legacy</Chip>
                )
              }
            >
              <p className="text-muted-foreground text-sm leading-relaxed">
                <SdkCaseCopy sdkCase={DEMO_SDK_CASE} />
              </p>
            </Section>
          )}

          <Section
            title="Evals"
            chip={
              evalDeprecated ? (
                <Chip variant="warning">2 deprecated</Chip>
              ) : (
                <Chip variant="warning">Almost ready</Chip>
              )
            }
          >
            {evalDeprecated ? (
              <>
                <p className="text-muted-foreground mb-2 text-sm">
                  These evals target trace input/output, which is frozen and
                  stops running <span className="text-dark-yellow">Oct 1</span>.
                  Point them at an observation instead:
                </p>
                <div className="flex flex-col gap-1">
                  {DEPRECATED_EVALS.map((name) =>
                    evalsUrl ? (
                      <Link
                        key={name}
                        href={evalsUrl}
                        onClick={onNavigate}
                        className="text-dark-blue self-start text-sm hover:underline"
                      >
                        {name}
                      </Link>
                    ) : (
                      <span key={name} className="text-sm">
                        {name}
                      </span>
                    ),
                  )}
                </div>
              </>
            ) : (
              <p className="text-muted-foreground text-sm">
                Review minimal config changes
              </p>
            )}
          </Section>

          <Section
            title="Legacy APIs"
            chip={<Chip variant="warning">3 deprecated</Chip>}
          >
            <p className="text-muted-foreground mb-2 text-sm">
              You&apos;ve called these deprecated endpoints in the last 7 days.
              They stop working <span className="text-dark-yellow">Oct 1</span>;
              the{" "}
              <ExternalLink href="https://api.reference.langfuse.com">
                new APIs
              </ExternalLink>{" "}
              cover the same data.
            </p>
            <div className="flex flex-col">
              {LEGACY_APIS.map((api) => (
                <div
                  key={api.endpoint}
                  className="flex items-center justify-between gap-2 py-0.5"
                >
                  <ExternalLink
                    href="https://api.reference.langfuse.com"
                    className="text-sm"
                  >
                    {api.endpoint}
                  </ExternalLink>
                  <span className="text-muted-foreground text-xs">
                    {api.volume}
                  </span>
                </div>
              ))}
            </div>
          </Section>

          <Section
            title="Legacy Integrations"
            chip={<Chip variant="warning">3 deprecated</Chip>}
          >
            <p className="text-muted-foreground mb-2 text-sm">
              These exports still read from the old data source. Switching them
              over can change what downstream consumers receive, so worth a
              quick check.
            </p>
            <div className="flex flex-col">
              {LEGACY_INTEGRATIONS.map((name) => (
                <div key={name} className="flex items-center py-0.5">
                  {typeof projectId === "string" ? (
                    <Link
                      href={`/project/${projectId}/settings/integrations`}
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
