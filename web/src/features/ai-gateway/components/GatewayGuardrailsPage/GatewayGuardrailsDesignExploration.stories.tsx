import { useState, type ReactNode } from "react";
import { fn } from "storybook/test";
import {
  ArrowUpRight,
  Ban,
  Box,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Cloud,
  EyeOff,
  FileText,
  Gauge,
  Grid2X2,
  Home,
  KeyRound,
  LifeBuoy,
  ListTree,
  Lock,
  PanelLeft,
  Plus,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
} from "@langfuse/icons";

import preview from "@/.storybook/preview";
import { Avatar } from "@/src/components/design-system/Avatar/Avatar";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { Button } from "@/src/components/design-system/Button/Button";
import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import { FeatureReleaseStatus } from "@/src/components/design-system/FeatureReleaseStatus/FeatureReleaseStatus";
import { KeyboardShortcut } from "@/src/components/design-system/KeyboardShortcut/KeyboardShortcut";
import { LangfuseIcon } from "@/src/components/design-system/LangfuseIcon/LangfuseIcon";
import { TimeRangePicker } from "@/src/components/date-picker";
import { TableCardContainer } from "@/src/components/layouts/TableCardContainer";
import type { LangfuseColumnDef } from "@/src/components/table/types";
import {
  GATEWAY_GUARDRAIL_TEMPLATES,
  type GatewayGuardrailTemplate,
  type GatewayGuardrailTemplatePreview,
} from "@/src/features/ai-gateway/components/GatewayGuardrailDialogController/constants/gatewayGuardrailTemplates";
import templateStyles from "@/src/features/ai-gateway/components/GatewayGuardrailDialogController/components/GatewayGuardrailTemplateGallery/GatewayGuardrailTemplateGallery.module.css";
import diagramStyles from "@/src/features/ai-gateway/components/GatewayFanOutDiagram/gatewayFanOutDiagram.module.css";
import { buildGuardrailChartData } from "@/src/features/ai-gateway/components/GatewayGuardrailsPage/components/GatewayGuardrailsChart/fns/buildGuardrailChartData";
import { GatewayGuardrailsTable } from "@/src/features/ai-gateway/components/GatewayGuardrailsPage/components/GatewayGuardrailsTable/GatewayGuardrailsTable";
import { GatewayPlaceholder } from "@/src/features/ai-gateway/components/GatewayPlaceholder/GatewayPlaceholder";
import { GATEWAY_ANALYTICS_TIME_RANGE_PRESETS } from "@/src/features/ai-gateway/constants/gatewayAnalyticsTimeRangePresets";
import { GATEWAY_GUARDRAILS_DOCS_URL } from "@/src/features/ai-gateway/constants/gatewayDocsUrls";
import { GATEWAY_GUARDRAIL_MAX_PER_ORGANIZATION } from "@/src/features/ai-gateway/constants/gatewayGuardrails";
import {
  GATEWAY_TIME_SERIES_INTERVALS,
  type GatewayTimeSeriesInterval,
} from "@/src/features/ai-gateway/constants/gatewayTimeSeriesIntervals";
import { providerIcons } from "@/src/features/ai-gateway/constants/providerIcons";
import type { GatewayGuardrailRow } from "@/src/features/ai-gateway/types/gatewayGuardrailRow";
import { WidgetChartCard } from "@/src/features/widgets/components/WidgetChartCard";
import type { TimeRange } from "@/src/utils/date-range-utils";
import { cn } from "@/src/utils/tailwind";

const MOCK_GUARDRAILS: GatewayGuardrailRow[] = [
  {
    id: "gr-pii-redact",
    name: "PII redaction",
    type: "REGEX",
    action: "REDACT",
    scope: "ENTIRE_INPUT",
    redactionLabel: "[PII_REDACTED]",
    presets: ["email", "us_ssn", "credit_card", "iban"],
    secretPrefixes: [],
    containsWords: [],
    customRegex: null,
    bedrock: null,
    assignments: [{ id: "a-1", scope: "ORGANIZATION", label: "Everyone" }],
    flaggedCount7d: 148,
    createdAt: new Date("2026-11-10T09:00:00Z"),
    updatedAt: new Date("2026-11-24T14:30:00Z"),
  },
  {
    id: "gr-secrets-block",
    name: "Secrets and API keys",
    type: "REGEX",
    action: "BLOCK",
    scope: "LAST_TURN",
    redactionLabel: null,
    presets: [
      "openai_api_key",
      "anthropic_api_key",
      "aws_access_key_id",
      "github_token",
    ],
    secretPrefixes: ["lf_gw_"],
    containsWords: [],
    customRegex: null,
    bedrock: null,
    assignments: [{ id: "a-2", scope: "ORGANIZATION", label: "Everyone" }],
    flaggedCount7d: 34,
    createdAt: new Date("2026-11-11T10:15:00Z"),
    updatedAt: new Date("2026-11-25T08:00:00Z"),
  },
  {
    id: "gr-codenames-log",
    name: "Internal codenames",
    type: "REGEX",
    action: "LOG",
    scope: "LAST_TURN_AND_OUTPUT",
    redactionLabel: null,
    presets: [],
    secretPrefixes: [],
    containsWords: ["Project Falcon", "Project Aurora"],
    customRegex: null,
    bedrock: null,
    assignments: [
      {
        id: "a-3",
        scope: "API_KEY",
        apiKeyId: "key-dev",
        label: "Engineering CLI",
      },
      {
        id: "a-4",
        scope: "API_KEY",
        apiKeyId: "key-staging",
        label: "Staging service",
      },
    ],
    flaggedCount7d: 19,
    createdAt: new Date("2026-11-14T16:40:00Z"),
    updatedAt: new Date("2026-11-22T11:10:00Z"),
  },
  {
    id: "gr-order-regex",
    name: "Order reference format",
    type: "REGEX",
    action: "REDACT",
    scope: "OUTPUT",
    redactionLabel: "[ORDER_ID]",
    presets: [],
    secretPrefixes: [],
    containsWords: [],
    customRegex: String.raw`ORD-\d{6}`,
    bedrock: null,
    assignments: [
      {
        id: "a-5",
        scope: "API_KEY",
        apiKeyId: "key-support",
        label: "Support assistant",
      },
    ],
    flaggedCount7d: 7,
    createdAt: new Date("2026-11-18T11:20:00Z"),
    updatedAt: new Date("2026-11-25T17:05:00Z"),
  },
  {
    id: "gr-bedrock-safety",
    name: "Amazon Bedrock safety",
    type: "BEDROCK",
    action: "ENFORCE",
    scope: "LAST_TURN",
    redactionLabel: null,
    presets: [],
    secretPrefixes: [],
    containsWords: [],
    customRegex: null,
    bedrock: {
      guardrailId: "gr-demo-01",
      guardrailVersion: "DRAFT",
      region: "us-east-1",
    },
    assignments: [{ id: "a-6", scope: "ORGANIZATION", label: "Everyone" }],
    flaggedCount7d: 26,
    createdAt: new Date("2026-11-20T13:00:00Z"),
    updatedAt: new Date("2026-11-26T09:15:00Z"),
  },
];

const MOCK_TIME_SERIES_POINTS = [
  { timeDimension: "2026-11-13", count: 14 },
  { timeDimension: "2026-11-14", count: 22 },
  { timeDimension: "2026-11-15", count: 11 },
  { timeDimension: "2026-11-16", count: 9 },
  { timeDimension: "2026-11-17", count: 28 },
  { timeDimension: "2026-11-18", count: 35 },
  { timeDimension: "2026-11-19", count: 19 },
  { timeDimension: "2026-11-20", count: 31 },
  { timeDimension: "2026-11-21", count: 26 },
  { timeDimension: "2026-11-22", count: 16 },
  { timeDimension: "2026-11-23", count: 18 },
  { timeDimension: "2026-11-24", count: 42 },
  { timeDimension: "2026-11-25", count: 38 },
  { timeDimension: "2026-11-26", count: 29 },
];

const SELECT_COLUMN: LangfuseColumnDef<GatewayGuardrailRow> = {
  id: "select",
  accessorKey: "select",
  size: 32,
  isFixedPosition: true,
  isPinnedLeft: true,
  enableResizing: false,
  header: () => <Checkbox aria-label="Select all" />,
  cell: () => <Checkbox aria-label="Select row" />,
};

function GatewayAppShell({
  showTimeRange = true,
  headerActions,
  children,
}: {
  showTimeRange?: boolean;
  headerActions?: ReactNode;
  children: ReactNode;
}) {
  const [timeRange, setTimeRange] = useState<TimeRange>({
    range: "last30Days",
  });

  const navItems = [
    { label: "Overview", icon: Home, active: false },
    { label: "Gateway keys", icon: KeyRound, active: false },
    { label: "Connections & Models", icon: Box, active: false },
    { label: "Budgets", icon: Gauge, active: false },
    { label: "Guardrails", icon: ShieldCheck, active: true },
    { label: "Tracing", icon: ListTree, active: false, external: true },
  ];

  return (
    <div className="bg-background text-foreground flex h-screen w-full overflow-hidden">
      {/* Mirrors the real Langfuse organization AI Gateway sidebar */}
      <aside className="bg-sidebar text-sidebar-foreground border-sidebar-border flex w-[204px] shrink-0 flex-col border-r">
        <div className="border-sidebar-border flex min-h-11 items-center justify-between gap-2 border-b px-3">
          <div className="flex min-w-0 items-center gap-2">
            <LangfuseIcon size={16} />
            <span className="text-foreground truncate text-sm font-medium">
              Seed Org
            </span>
            <Badge color="filled" size="sm" text="TEAM" />
          </div>
          <DropdownIndicator direction="up-down" />
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
          <div className="text-sidebar-foreground hover:bg-sidebar-accent flex h-8 items-center justify-between rounded-sm px-2 text-sm">
            <span className="flex items-center gap-2">
              <Search size="base" color="muted" />
              <span>Go to...</span>
            </span>
            <KeyboardShortcut keys={["Mod", "K"]} />
          </div>
          <div className="text-sidebar-foreground hover:bg-sidebar-accent flex h-8 items-center gap-2 rounded-sm px-2 text-sm">
            <Grid2X2 size="base" color="muted" />
            <span>Projects</span>
          </div>

          <div className="mt-3 mb-1 flex items-center gap-2 px-2">
            <span className="text-muted-foreground text-xs font-medium">
              AI Gateway
            </span>
            <FeatureReleaseStatus status="beta" />
          </div>
          {navItems.map(({ label, icon: Icon, active, external }) => (
            <div
              key={label}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-8 items-center gap-2 rounded-sm px-2 text-sm",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-bold"
                  : "text-sidebar-foreground hover:bg-sidebar-accent",
              )}
            >
              <Icon size="base" color={active ? "default" : "muted"} />
              <span className="truncate">{label}</span>
              {external ? (
                <ArrowUpRight size="sm" color="tertiary" aria-hidden />
              ) : null}
            </div>
          ))}
        </nav>

        <div className="border-sidebar-border flex flex-col gap-0.5 p-2">
          <div className="text-sidebar-foreground flex h-8 items-center gap-2 rounded-sm px-2 text-sm">
            <Settings size="base" color="muted" />
            <span>Settings</span>
          </div>
          <div className="text-sidebar-foreground flex h-8 items-center gap-2 rounded-sm px-2 text-sm">
            <LifeBuoy size="base" color="muted" />
            <span>Support</span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-2 rounded-sm px-2 py-1.5">
            <div className="flex min-w-0 items-center gap-2">
              <Avatar displayName="Demo User" size="sm" />
              <div className="flex min-w-0 flex-col">
                <span className="text-foreground truncate text-xs font-medium">
                  Demo User
                </span>
                <span className="text-muted-foreground text-[11px]">
                  v4.88.0
                </span>
              </div>
            </div>
            <DropdownIndicator direction="up-down" />
          </div>
        </div>
      </aside>

      {/* Main Content Area — mirrors Page + PageHeader 2-row chrome */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="bg-background shrink-0 border-b">
          {/* Top 44px chrome row: sidebar toggle on left, TimeRangePicker on right */}
          <div className="flex min-h-11 items-center justify-between border-b px-3">
            <span className="text-muted-foreground flex size-7 items-center justify-center rounded-sm">
              <PanelLeft size="base" />
            </span>
            <div className="flex items-center gap-2">
              {showTimeRange ? (
                <TimeRangePicker
                  timeRange={timeRange}
                  onTimeRangeChange={setTimeRange}
                  timeRangePresets={GATEWAY_ANALYTICS_TIME_RANGE_PRESETS}
                  className="my-0 max-w-full overflow-x-auto"
                  triggerClassName="px-2"
                />
              ) : null}
            </div>
          </div>

          {/* Second row: Page title on left, primary page actions on right */}
          <div className="flex min-h-11 items-center justify-between gap-3 px-3 py-1.5">
            <h2 className="text-primary truncate text-lg leading-6 font-bold">
              Guardrails
            </h2>
            <div className="flex items-center gap-2">
              {headerActions ?? (
                <Button icon={Plus} text="Add guardrail" onClick={fn()} />
              )}
            </div>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto p-3">{children}</main>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Shared helpers for Current & Exploration Views                            */
/* -------------------------------------------------------------------------- */

function GuardrailsChartPreview({ populated }: { populated: boolean }) {
  const [interval, setInterval] = useState<GatewayTimeSeriesInterval>("day");
  const prepared = populated
    ? buildGuardrailChartData({
        groupByGuardrail: false,
        points: MOCK_TIME_SERIES_POINTS,
      })
    : { data: [], config: {} };

  return (
    <div className="h-96 min-w-0">
      <WidgetChartCard
        title="Flagged requests"
        description="Select rows below to see their flagged requests."
        chartType="BAR_TIME_SERIES"
        data={prepared.data}
        config={prepared.config}
        zeroBaseline
        tabs={{
          value: interval,
          options: [...GATEWAY_TIME_SERIES_INTERVALS],
          onValueChange: (value) => {
            const option = GATEWAY_TIME_SERIES_INTERVALS.find(
              (c) => c.value === value,
            );
            if (option) setInterval(option.value);
          },
          variant: "toggle",
        }}
      />
    </div>
  );
}

function GuardrailsTablePreview({ rows }: { rows: GatewayGuardrailRow[] }) {
  const [search, setSearch] = useState("");
  return (
    <GatewayGuardrailsTable
      canManage
      ingestionProjectId="proj-demo"
      tracesTarget="traces"
      data={{ status: "success", data: rows }}
      onRowClick={fn()}
      selectColumn={SELECT_COLUMN}
      multiSelect={{
        selectAll: false,
        setSelectAll: fn(),
        selectedRowIds: [],
        setRowSelection: fn(),
        pageSize: 10,
        pageIndex: 0,
        totalCount: rows.length,
      }}
      onEditGuardrail={fn()}
      onDeleteGuardrail={fn()}
      search={{ value: search, onChange: setSearch }}
      pagination={{
        mode: "offset",
        totalCount: rows.length,
        state: { pageIndex: 0, pageSize: 10 },
        onChange: fn(),
      }}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*  Option A: Consistent AI Gateway Splash (GatewayPlaceholder pattern)       */
/* -------------------------------------------------------------------------- */

function GatewayGuardrailFlowDiagram() {
  const inputs = [
    { label: "email: dana@example.com", y: 54 },
    { label: "openai_key: sk-proj-4f9a...", y: 120 },
    { label: "keyword: Project Falcon", y: 186 },
  ];
  const outcomes = [
    { label: "Block request", y: 54, dotColor: "#dc2626" },
    { label: "Redact with [REDACTED]", y: 120, dotColor: "#d97706" },
    { label: "Log on trace", y: 186, dotColor: "#2563eb" },
  ];

  const leftX = 72;
  const leftW = 256;
  const leftEdge = leftX + leftW;
  const rightX = 632;
  const rightW = 256;
  const hubX = 480;
  const hubY = 120;

  return (
    <svg
      viewBox="0 0 960 240"
      fill="none"
      aria-hidden="true"
      className="text-foreground block h-auto w-full overflow-visible"
    >
      {/* Left matched-pattern chips -> center shield hub */}
      {inputs.map(({ label, y }, index) => {
        const d = `M${leftEdge} ${y}C392 ${y} 404 ${hubY} ${hubX - 30} ${hubY}`;
        return (
          <g key={label}>
            <path
              d={d}
              strokeWidth={1.25}
              className="stroke-foreground-tertiary"
            />
            <path
              d={d}
              pathLength={100}
              strokeWidth={2.2}
              strokeLinecap="round"
              className={cn("stroke-muted-foreground", diagramStyles.pulse)}
              style={{ animationDelay: `${index * -0.9}s` }}
            />
            <rect
              x={leftX}
              y={y - 17}
              width={leftW}
              height={34}
              rx={6}
              className={cn("fill-popover", diagramStyles.chip)}
            />
            <text
              x={leftX + 14}
              y={y}
              dominantBaseline="central"
              fontSize={12}
              className="fill-foreground-secondary font-mono"
            >
              {label}
            </text>
          </g>
        );
      })}

      {/* Center shield hub -> right action chips */}
      {outcomes.map(({ label, y, dotColor }) => {
        const d = `M${hubX + 30} ${hubY}C556 ${hubY} 568 ${y} ${rightX} ${y}`;
        return (
          <g key={label}>
            <path
              d={d}
              strokeWidth={1.25}
              strokeDasharray="3 4"
              className="stroke-foreground-tertiary opacity-80"
            />
            <rect
              x={rightX}
              y={y - 17}
              width={rightW}
              height={34}
              rx={6}
              className={cn("fill-popover", diagramStyles.chip)}
            />
            <circle cx={rightX + 18} cy={y} r={4} fill={dotColor} />
            <text
              x={rightX + 32}
              y={y}
              dominantBaseline="central"
              fontSize={12}
              className="fill-foreground-secondary font-mono"
            >
              {label}
            </text>
          </g>
        );
      })}

      {/* Center shield hub */}
      <rect
        x={hubX - 24}
        y={hubY - 24}
        width={48}
        height={48}
        rx={12}
        className="fill-primary"
      />
      <ShieldCheck
        size="lg"
        color="inherit"
        __rawClassName="text-primary-foreground"
        x={hubX - 11}
        y={hubY - 11}
      />
    </svg>
  );
}

function OptionAGatewaySplashView() {
  return (
    <GatewayAppShell showTimeRange={false}>
      <GatewayPlaceholder.Frame
        title="Protect gateway traffic"
        description="Inspect prompts and responses before they reach a model or return to your users. Block, redact, or log matches across every connected provider."
      >
        <GatewayPlaceholder.Actions>
          <Button
            variant="outline"
            text="How guardrails work"
            href={GATEWAY_GUARDRAILS_DOCS_URL}
          />
          <Button text="Add guardrail" icon={Plus} onClick={fn()} />
        </GatewayPlaceholder.Actions>
        <GatewayPlaceholder.Diagram>
          <GatewayGuardrailFlowDiagram />
        </GatewayPlaceholder.Diagram>
        <GatewayPlaceholder.Benefits>
          <GatewayPlaceholder.Benefit
            icon={Lock}
            title="Built-in PII & secrets detection"
            description="Catch emails, SSNs, credit cards, API keys, and tokens with sub-millisecond regex rules."
          />
          <GatewayPlaceholder.Benefit
            icon={EyeOff}
            title="Block, redact, or log"
            description="Reject requests, mask matched text in place, or log matches quietly on gateway traces."
          />
          <GatewayPlaceholder.Benefit
            icon={SlidersHorizontal}
            title="Scoped to org, users, or keys"
            description="Apply guardrails organization-wide or target specific users and gateway keys."
          />
          <GatewayPlaceholder.Benefit
            icon={Cloud}
            title="External provider support"
            description="Connect your existing Amazon Bedrock guardrails alongside built-in pattern checks."
          />
        </GatewayPlaceholder.Benefits>
      </GatewayPlaceholder.Frame>
    </GatewayAppShell>
  );
}

/* -------------------------------------------------------------------------- */
/*  Option B: Inline Template Gallery First-Run View                          */
/* -------------------------------------------------------------------------- */

const BUILT_IN_TEMPLATES = GATEWAY_GUARDRAIL_TEMPLATES.filter(
  (t) => !t.external,
);
const INTEGRATION_TEMPLATES = GATEWAY_GUARDRAIL_TEMPLATES.filter((t) =>
  Boolean(t.external),
);

function TemplatePreviewBanner({
  preview: templatePreview,
}: {
  preview: GatewayGuardrailTemplatePreview;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        templateStyles.preview,
        "flex h-20 items-center justify-center overflow-hidden rounded-md px-2.5",
      )}
    >
      {templatePreview.kind === "logo" ? (
        <span className="bg-popover/95 border-border/60 flex items-center gap-2 rounded-md border px-2.5 py-1 shadow-2xs">
          <providerIcons.BEDROCK size="base" aria-hidden />
          <span className="text-foreground font-mono text-xs font-medium">
            Amazon Bedrock
          </span>
        </span>
      ) : (
        <span className="bg-popover/95 border-border/60 flex max-w-full min-w-0 items-center gap-1 rounded-md border px-2 py-1 font-mono text-[11px] shadow-2xs">
          <span className="text-muted-foreground shrink-0">
            {templatePreview.label}:
          </span>
          <span className="text-foreground truncate font-medium">
            {templatePreview.value}
          </span>
        </span>
      )}
    </div>
  );
}

function InlineTemplateCard({
  template,
}: {
  template: GatewayGuardrailTemplate;
}) {
  const isExternal = Boolean(template.external);
  const footerLabel = isExternal ? "External" : "Built-in";

  return (
    <div
      className={cn(
        templateStyles.card,
        "group/card bg-popover flex h-full flex-col overflow-hidden rounded-lg border text-left transition-shadow",
      )}
    >
      <div className="px-3 pt-3">
        <TemplatePreviewBanner preview={template.preview} />
      </div>
      <div className="flex flex-1 flex-col gap-1.5 px-3 pt-3 pb-3">
        <span className="text-foreground text-sm font-bold">
          {template.name}
        </span>
        <p className="text-muted-foreground text-xs leading-relaxed">
          {template.description}
        </p>
      </div>
      <div className="border-border/60 flex items-center justify-between gap-2 border-t px-3 py-2.5">
        <span className="text-muted-foreground text-xs whitespace-nowrap">
          {footerLabel}
        </span>
        <button
          type="button"
          onClick={fn()}
          className="text-link group-hover/card:text-link-hover inline-flex shrink-0 items-center gap-0.5 text-xs font-medium whitespace-nowrap"
        >
          Use template
          <ChevronRight size="sm" color="inherit" aria-hidden />
        </button>
      </div>
    </div>
  );
}

function OptionBInlineTemplateGalleryView() {
  return (
    <GatewayAppShell showTimeRange={false}>
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-8 py-6">
        <div className="flex flex-col items-center gap-2.5 text-center">
          <h2 className="text-3xl font-bold tracking-tight">
            Add your first guardrail
          </h2>
          <p className="text-foreground-secondary max-w-xl text-base">
            Inspect prompts and responses passing through the AI Gateway to
            block, redact, or log sensitive content. Pick a template to
            configure and test it in seconds.{" "}
            <Button
              variant="text"
              text="How guardrails work"
              href={GATEWAY_GUARDRAILS_DOCS_URL}
            />
          </p>
        </div>

        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold">Built-in guardrails</h3>
              <Badge
                color="filled"
                size="sm"
                text={String(BUILT_IN_TEMPLATES.length)}
              />
            </div>
            <div className="grid auto-rows-fr grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {BUILT_IN_TEMPLATES.map((template) => (
                <InlineTemplateCard key={template.id} template={template} />
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold">Integrations</h3>
              <Badge
                color="filled"
                size="sm"
                text={String(INTEGRATION_TEMPLATES.length)}
              />
            </div>
            <div className="grid auto-rows-fr grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {INTEGRATION_TEMPLATES.map((template) => (
                <InlineTemplateCard key={template.id} template={template} />
              ))}
            </div>
          </div>
        </div>
      </section>
    </GatewayAppShell>
  );
}

/* -------------------------------------------------------------------------- */
/*  Option C: Operational Overview + Summary Strip + Collapsed Chart          */
/* -------------------------------------------------------------------------- */

function SummaryStatCard({
  title,
  value,
  subtitle,
  icon: Icon,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: typeof ShieldCheck;
}) {
  return (
    <div className="bg-background flex flex-col gap-1.5 rounded-lg border p-4 shadow-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="text-foreground text-sm font-bold">{title}</span>
        <Icon size="sm" color="tertiary" aria-hidden />
      </div>
      <span className="text-muted-foreground text-xs">{subtitle}</span>
      <div className="text-foreground pt-2 text-3xl font-bold tracking-tight tabular-nums">
        {value}
      </div>
    </div>
  );
}

function getTemplateMiniBadge(template: GatewayGuardrailTemplate) {
  switch (template.id) {
    case "pii":
      return "PII";
    case "secrets":
      return "***";
    case "contains":
      return "Aa";
    case "custom_regex":
      return ".*";
    case "bedrock":
      return <providerIcons.BEDROCK size="sm" aria-hidden />;
  }
}

function OptionCOperationalOverviewView({
  initialChartExpanded = false,
}: {
  initialChartExpanded?: boolean;
}) {
  const [chartExpanded, setChartExpanded] = useState(initialChartExpanded);

  return (
    <GatewayAppShell showTimeRange>
      <div className="flex flex-col gap-3">
        {/* 4-column summary KPI strip matching Overview DataCard visual grammar */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryStatCard
            title="Active guardrails"
            value="0"
            subtitle={`0 of ${GATEWAY_GUARDRAIL_MAX_PER_ORGANIZATION} organization limit`}
            icon={ShieldCheck}
          />
          <SummaryStatCard
            title="Flagged requests"
            value="0"
            subtitle="Matches in the last 30 days"
            icon={ShieldAlert}
          />
          <SummaryStatCard
            title="Blocked"
            value="0"
            subtitle="Requests rejected on match"
            icon={Ban}
          />
          <SummaryStatCard
            title="Redacted"
            value="0"
            subtitle="Matches masked in place"
            icon={EyeOff}
          />
        </div>

        {/* Collapsible chart bar — collapsed when empty, expands on click */}
        {chartExpanded ? (
          <div className="relative">
            <GuardrailsChartPreview populated={false} />
            <div className="absolute top-3 right-3">
              <Button
                variant="ghost"
                size="sm"
                icon={ChevronUp}
                text="Collapse"
                onClick={() => setChartExpanded(false)}
              />
            </div>
          </div>
        ) : (
          <div className="bg-background flex items-center justify-between gap-4 rounded-lg border px-4 py-3 shadow-xs">
            <div className="flex min-w-0 items-center gap-3">
              <h3 className="text-foreground text-sm font-bold">
                Flagged requests
              </h3>
              <span className="text-muted-foreground truncate text-xs">
                No flagged requests in the last 30 days — the chart expands
                automatically once guardrails record matches.
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              icon={ChevronDown}
              text="Show chart"
              onClick={() => setChartExpanded(true)}
            />
          </div>
        )}

        {/* Guided empty state inside TableCardContainer (hides empty search bar) */}
        <TableCardContainer>
          <div className="flex flex-col items-center gap-6 px-6 py-12 text-center">
            <div className="flex flex-col items-center gap-2">
              <span className="bg-muted text-foreground flex size-10 items-center justify-center rounded-lg border">
                <ShieldCheck size="lg" />
              </span>
              <h3 className="text-foreground text-base font-bold">
                No guardrails configured yet
              </h3>
              <p className="text-muted-foreground max-w-md text-sm">
                Add a guardrail to inspect prompts and responses across your AI
                Gateway. Start from a template below or build a custom rule.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2">
              {GATEWAY_GUARDRAIL_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={fn()}
                  className="bg-popover hover:bg-accent border-border flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors"
                >
                  <span className="bg-muted text-foreground flex size-5 shrink-0 items-center justify-center rounded-sm border font-mono text-[10px] font-bold">
                    {getTemplateMiniBadge(template)}
                  </span>
                  <span className="text-foreground font-medium">
                    {template.name}
                  </span>
                  <Plus size="sm" color="muted" aria-hidden />
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button
                variant="outline"
                icon={FileText}
                text="How guardrails work"
                href={GATEWAY_GUARDRAILS_DOCS_URL}
              />
              <Button icon={Plus} text="Add guardrail" onClick={fn()} />
            </div>
          </div>
        </TableCardContainer>
      </div>
    </GatewayAppShell>
  );
}

/* -------------------------------------------------------------------------- */
/*  Storybook Meta & Stories                                                  */
/* -------------------------------------------------------------------------- */

const meta = preview.meta({
  parameters: {
    layout: "fullscreen",
  },
});

export const CurrentEmpty = meta.story({
  render: () => (
    <GatewayAppShell showTimeRange>
      <div className="flex flex-col gap-2">
        <GuardrailsChartPreview populated={false} />
        <GuardrailsTablePreview rows={[]} />
      </div>
    </GatewayAppShell>
  ),
});

export const CurrentPopulated = meta.story({
  render: () => (
    <GatewayAppShell showTimeRange>
      <div className="flex flex-col gap-2">
        <GuardrailsChartPreview populated />
        <GuardrailsTablePreview rows={MOCK_GUARDRAILS} />
      </div>
    </GatewayAppShell>
  ),
});

export const OptionAGatewaySplash = meta.story({
  render: () => <OptionAGatewaySplashView />,
});

export const OptionBInlineTemplateGallery = meta.story({
  render: () => <OptionBInlineTemplateGalleryView />,
});

export const OptionCOperationalOverview = meta.story({
  render: () => <OptionCOperationalOverviewView />,
});
