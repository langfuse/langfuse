import { type ReactNode } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import {
  ChevronRight,
  Code,
  Copy,
  Lightbulb,
  List,
  ListTree,
  Sparkles,
  SquareTerminal,
  TriangleAlert,
  X,
} from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { RainbowButton } from "@/src/components/magicui/rainbow-button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/src/components/ui/breadcrumb";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/src/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { useV4MigrationPanel } from "@/src/features/v4-migration/V4MigrationPanelProvider";
import { useInAppAiAgent } from "@/src/ee/features/in-app-agent/components/InAppAiAgentProvider";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { cn } from "@/src/utils/tailwind";

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
// variant renders is picked by the sdkCase/evalCase constants in the panel.
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

const LEGACY_APIS = [
  { endpoint: "GET /api/public/traces", volume: "8,680 / week" },
  { endpoint: "GET /api/public/sessions", volume: "2,170 / week" },
  { endpoint: "GET /api/public/metrics", volume: "315 / week" },
];

const LEGACY_INTEGRATIONS = ["PostHog", "Mixpanel", "Blob Storage"];

const DEPRECATED_EVALS = ["hallucination-check", "answer-relevance"];

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
        "rounded px-2 py-0.5 font-mono text-[11px]",
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
  icon,
  title,
  chip,
  children,
}: {
  icon: ReactNode;
  title: string;
  chip: ReactNode;
  children: ReactNode;
}) {
  return (
    <Collapsible className="border-b">
      <CollapsibleTrigger className="group flex w-full items-center gap-2.5 py-3 text-left">
        <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
        {icon}
        <span className="flex-1 text-sm">{title}</span>
        {chip}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="pt-0.5 pb-3.5 pl-13">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function MonoValue({ children }: { children: ReactNode }) {
  return <span className="text-foreground font-medium">{children}</span>;
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
      className={cn("text-primary font-medium hover:underline", className)}
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
          You&apos;re on a very old SDK (<MonoValue>Python v2.x</MonoValue>).
          Upgrade to the latest version to get real-time data.
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

export const V4MigrationPanel = ({
  showCloseButton = true,
  className,
}: {
  showCloseButton?: boolean;
  className?: string;
}) => {
  const { open, setOpen } = useV4MigrationPanel();
  const router = useRouter();
  const { setOpen: setAiAgentOpen, isAvailable: aiAgentAvailable } =
    useInAppAiAgent();
  const hasInAppAgentEntitlement = useHasEntitlement("in-app-agent");
  const capture = usePostHogClientCapture();
  const sdkCase = 1 as number;
  const evalCase = 3 as number;

  if (!open) return null;

  const projectId = router.query.projectId;
  const evalsUrl =
    typeof projectId === "string" ? `/project/${projectId}/evals` : undefined;
  const showInAppAgentOption = aiAgentAvailable && hasInAppAgentEntitlement;

  const evalDeprecated = EVAL_CASES[evalCase - 1].deprecated;

  const handleOpenInAppAgent = () => {
    capture("v4_migration:in_app_agent_opened");
    setAiAgentOpen(true);
  };

  const handleCopyPrompt = async () => {
    capture("v4_migration:coding_agent_prompt_copied");
    await navigator.clipboard.writeText(CODING_AGENT_PROMPT);
    showSuccessToast({
      title: "Prompt copied",
      description: "Paste it into Cursor, Codex, or another coding agent.",
    });
  };

  return (
    <div
      className={cn([
        "bg-background flex h-full w-full min-w-0 flex-col",
        className,
      ])}
    >
      <div className="bg-background">
        <div className="flex min-h-11 w-full items-center justify-between gap-1 px-4 py-1">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>Migrate to v4</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          {showCloseButton && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setOpen(false)}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto border-t">
        <div className="bg-background sticky top-0 z-[1] border-b px-4 pt-4 pb-3">
          <div className="mb-1.5 flex items-center gap-2">
            <TriangleAlert className="text-dark-yellow h-[18px] w-[18px] shrink-0" />
            <p className="text-base font-semibold">Update your setup</p>
          </div>
          <p className="text-muted-foreground mb-3 text-sm leading-relaxed">
            {sdkCase === 3 ? (
              "Your setup is outdated and requires an update. "
            ) : (
              <>
                Your instrumentation is outdated and requires an update. Live
                data <span className="text-dark-yellow">15 minutes behind</span>
                .{" "}
              </>
            )}
            Some features will be{" "}
            <ExternalLink href={V4_DOCS_URL}>deprecated by Oct 1</ExternalLink>.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <RainbowButton className="w-full">
                  <Copy className="mr-1.5 h-4 w-4" />
                  Update with agent
                </RainbowButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[340px]">
                {showInAppAgentOption && (
                  <DropdownMenuItem
                    onClick={handleOpenInAppAgent}
                    className="items-start gap-3 p-2.5"
                  >
                    <div className="bg-muted flex h-8 w-8 shrink-0 items-center justify-center rounded-md">
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <div className="flex min-w-0 flex-col">
                      <span className="text-sm font-medium">
                        Use the Langfuse in-app agent
                        <span className="bg-secondary text-secondary-foreground ml-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold">
                          Recommended
                        </span>
                      </span>
                      <span className="text-muted-foreground mt-0.5 text-xs">
                        Runs here, with your project and SDK context attached.
                      </span>
                    </div>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={handleCopyPrompt}
                  className="items-start gap-3 p-2.5"
                >
                  <div className="bg-muted flex h-8 w-8 shrink-0 items-center justify-center rounded-md">
                    <SquareTerminal className="h-4 w-4" />
                  </div>
                  <div className="flex min-w-0 flex-col">
                    <span className="text-sm font-medium">
                      Use your coding agent
                    </span>
                    <span className="text-muted-foreground mt-0.5 text-xs">
                      Copies a prompt for Cursor, Codex, or another agent.
                    </span>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" asChild>
              <a href={V4_DOCS_URL} target="_blank" rel="noopener noreferrer">
                Docs
              </a>
            </Button>
          </div>
        </div>

        <div className="px-4 pb-4">
          <div>
            {sdkCase !== 3 && (
              <Section
                icon={
                  <ListTree className="text-muted-foreground h-4 w-4 shrink-0" />
                }
                title="Tracing Instrumentation"
                chip={
                  SDK_CASES[sdkCase - 1].upToDate ? (
                    <Chip variant="success">up-to-date</Chip>
                  ) : (
                    <Chip variant="warning">legacy</Chip>
                  )
                }
              >
                <p className="text-muted-foreground text-sm leading-relaxed">
                  <SdkCaseCopy sdkCase={sdkCase} />
                </p>
              </Section>
            )}

            <Section
              icon={
                <Lightbulb className="text-muted-foreground h-4 w-4 shrink-0" />
              }
              title="Evals"
              chip={
                evalDeprecated ? (
                  <Chip variant="warning">2 · deprecated</Chip>
                ) : (
                  <Chip variant="warning">almost ready</Chip>
                )
              }
            >
              {evalDeprecated ? (
                <>
                  <p className="text-muted-foreground mb-2 text-sm">
                    Editing is frozen; stops running{" "}
                    <span className="text-dark-yellow">Oct 1</span>. Repoint
                    each to an observation.
                  </p>
                  <div className="flex flex-col gap-2">
                    {DEPRECATED_EVALS.map((name) =>
                      evalsUrl ? (
                        <Link
                          key={name}
                          href={evalsUrl}
                          className="text-primary self-start text-sm font-medium hover:underline"
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
              icon={<Code className="text-muted-foreground h-4 w-4 shrink-0" />}
              title="Legacy APIs"
              chip={<Chip variant="warning">3 · deprecated</Chip>}
            >
              <p className="text-muted-foreground mb-2 text-sm">
                Legacy APIs called in the last 7 days, deprecated by Oct 1.
                Migrate to the{" "}
                <ExternalLink href="https://api.reference.langfuse.com">
                  new APIs
                </ExternalLink>
                .
              </p>
              <div className="flex flex-col">
                {LEGACY_APIS.map((api) => (
                  <div
                    key={api.endpoint}
                    className="flex items-center justify-between gap-2 py-1"
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
              icon={<List className="text-muted-foreground h-4 w-4 shrink-0" />}
              title="Legacy Integrations"
              chip={<Chip variant="warning">3 · deprecated</Chip>}
            >
              <p className="text-muted-foreground mb-2 text-sm">
                These integrations are in use. Update the export source. This
                may affect downstream consumers.
              </p>
              <div className="flex flex-col">
                {LEGACY_INTEGRATIONS.map((name) => (
                  <div key={name} className="py-1">
                    {typeof projectId === "string" ? (
                      <Link
                        href={`/project/${projectId}/settings/integrations`}
                        className="text-primary text-sm font-medium hover:underline"
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
      </div>
    </div>
  );
};
