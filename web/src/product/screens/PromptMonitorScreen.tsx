import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState, type CSSProperties } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Database,
  Play,
  XCircle,
} from "lucide-react";
import { CodeMirrorEditor } from "@/src/components/editor";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  usePanelRef,
} from "@/src/components/ui/resizable";
import { ScrollArea } from "@/src/components/ui/scroll-area";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/src/components/ui/tabs";
import { cn } from "@/src/utils/tailwind";
import { PromptFrame } from "../frames/PromptFrame";
import { PREVIEW_MODELS, PREVIEW_PROMPT_MESSAGES } from "./PromptIterateScreen";
import {
  getPromptBreadcrumbs,
  getPromptStageHref,
  resolvePromptPreviewSlug,
} from "../shell/product-manifest";

type MonitorTimeRange = "Hourly" | "Daily" | "Monthly";
type MonitorTab = "completion" | "variables" | "evaluations" | "raw";
type EvaluationStatus = "passed" | "failed" | "unknown";

type PromptCallEvaluation = {
  id: string;
  name: string;
  status: EvaluationStatus;
  reason: string;
  scoreLabel: string;
};

type PromptCall = {
  id: string;
  startedAt: Date;
  bucketLabel: string;
  startedAtLabel: string;
  relativeLabel: string;
  title: string;
  modelId: string;
  durationSeconds: number;
  ttftSeconds: number;
  costUsd: number;
  completion: string;
  variables: Record<string, string>;
  deploymentId: string;
  environmentLabel: string;
  evaluations: PromptCallEvaluation[];
};

type PromptCallTemplate = Omit<
  PromptCall,
  | "id"
  | "startedAt"
  | "bucketLabel"
  | "startedAtLabel"
  | "relativeLabel"
  | "title"
  | "modelId"
  | "deploymentId"
  | "environmentLabel"
>;

const MONITOR_TIME_RANGES: MonitorTimeRange[] = ["Hourly", "Daily", "Monthly"];

const MONITOR_DEPLOYMENT_ID = "f4f3dd59-c99b-4133-9704-e3cb4a985246";
const MONITOR_NOW = new Date("2025-10-14T11:00:00");

const MONITOR_CALL_TEMPLATES: PromptCallTemplate[] = [
  {
    durationSeconds: 7,
    ttftSeconds: 1.1,
    costUsd: 0.001,
    variables: {
      product_area: "Marketing analytics",
      issue_summary:
        "Q4 campaigns launched focusing on social acquisition performance in EMEA.",
      routing_queue: "growth-ops",
      customer_tone: "direct and crisp",
    },
    completion:
      "Key Points:\n- Q4 social acquisition outperformed search in EMEA due to lower CPMs.\n- Conversion quality held steady after the audience split test.\n- Paid social saturation risk is highest in Germany and France.\n\nInsights:\n- Creative fatigue will likely show up before budget exhaustion.\n- The strongest lift came from short-form vertical video.\n- Search should remain the backstop channel for high-intent segments.\n\nActionable Recommendations:\n- Shift 12% of search budget into the best-performing social campaigns.\n- Refresh the top two creatives before the weekend push.\n- Keep Germany on a tighter CPA guardrail for the next cycle.",
    evaluations: [
      {
        id: "eval-cost",
        name: "Cost",
        status: "passed",
        reason: "Stayed below the configured $0.002 ceiling.",
        scoreLabel: "$0.0010",
      },
      {
        id: "eval-judge",
        name: "LLM as a Judge",
        status: "passed",
        reason:
          "Output was well structured and preserved the operating context.",
        scoreLabel: "0.83",
      },
      {
        id: "eval-latency",
        name: "Latency",
        status: "passed",
        reason: "Completed under the 8 second SLO for this prompt.",
        scoreLabel: "7.0s",
      },
      {
        id: "eval-text",
        name: "Text Matcher",
        status: "failed",
        reason:
          "Missing the exact phrase “budget exhaustion” in the insights section.",
        scoreLabel: "0.00",
      },
    ],
  },
  {
    durationSeconds: 7,
    ttftSeconds: 1.0,
    costUsd: 0.001,
    variables: {
      product_area: "Marketing analytics",
      issue_summary:
        "Q4 campaigns launched focusing on social acquisition performance in APAC.",
      routing_queue: "growth-ops",
      customer_tone: "direct and crisp",
    },
    completion:
      "Key Points:\n- APAC creative rotations are driving the strongest click-through gains.\n- Paid social is cheaper than planned, but lead quality is uneven by market.\n- Japan remains the most stable market for efficient acquisition.",
    evaluations: [
      {
        id: "eval-cost",
        name: "Cost",
        status: "passed",
        reason: "Output cost remained below the configured cost frame.",
        scoreLabel: "$0.0010",
      },
      {
        id: "eval-judge",
        name: "LLM as a Judge",
        status: "passed",
        reason:
          "The response stayed on format and preserved the key market signals.",
        scoreLabel: "0.79",
      },
      {
        id: "eval-latency",
        name: "Latency",
        status: "unknown",
        reason:
          "Latency score was skipped because trace instrumentation was incomplete.",
        scoreLabel: "n/a",
      },
      {
        id: "eval-text",
        name: "Text Matcher",
        status: "passed",
        reason: "Matched the required section headings and terminology.",
        scoreLabel: "1.00",
      },
    ],
  },
  {
    durationSeconds: 8,
    ttftSeconds: 1.4,
    costUsd: 0.0012,
    variables: {
      product_area: "Lifecycle reporting",
      issue_summary:
        "Weekly churn summaries need to isolate self-serve downgrade behavior by region.",
      routing_queue: "lifecycle-insights",
      customer_tone: "measured and practical",
    },
    completion:
      "Key Points:\n- Self-serve downgrades are clustering in markets with annual plan renewals.\n- Germany and the UK show the steepest week-over-week change.\n- The change is concentrated in low-touch accounts rather than managed ones.",
    evaluations: [
      {
        id: "eval-cost",
        name: "Cost",
        status: "passed",
        reason: "Within budget.",
        scoreLabel: "$0.0012",
      },
      {
        id: "eval-judge",
        name: "LLM as a Judge",
        status: "failed",
        reason:
          "The summary missed the managed-account caveat in the recommendations.",
        scoreLabel: "0.41",
      },
      {
        id: "eval-latency",
        name: "Latency",
        status: "passed",
        reason: "Met the latency frame.",
        scoreLabel: "8.0s",
      },
      {
        id: "eval-text",
        name: "Text Matcher",
        status: "passed",
        reason: "Expected section formatting was preserved.",
        scoreLabel: "1.00",
      },
    ],
  },
  {
    durationSeconds: 6,
    ttftSeconds: 0.9,
    costUsd: 0.0009,
    variables: {
      product_area: "Marketing analytics",
      issue_summary:
        "Q4 campaigns launched focusing on social acquisition performance in LATAM.",
      routing_queue: "growth-ops",
      customer_tone: "direct and crisp",
    },
    completion:
      "Key Points:\n- LATAM spend efficiency improved after excluding low-intent placement inventory.\n- The strongest gains came from Mexico and Brazil.\n- Funnel depth still lags EMEA despite the cheaper traffic mix.",
    evaluations: [
      {
        id: "eval-cost",
        name: "Cost",
        status: "passed",
        reason: "Low cost run.",
        scoreLabel: "$0.0009",
      },
      {
        id: "eval-judge",
        name: "LLM as a Judge",
        status: "passed",
        reason: "Correctly balanced brevity and operational guidance.",
        scoreLabel: "0.88",
      },
      {
        id: "eval-latency",
        name: "Latency",
        status: "passed",
        reason: "Fast response for this route.",
        scoreLabel: "6.0s",
      },
      {
        id: "eval-text",
        name: "Text Matcher",
        status: "passed",
        reason: "Matched required headings.",
        scoreLabel: "1.00",
      },
    ],
  },
  {
    durationSeconds: 7,
    ttftSeconds: 1.2,
    costUsd: 0.0011,
    variables: {
      product_area: "Lifecycle reporting",
      issue_summary:
        "Board deck summary needs a clearer line on free-to-paid conversion quality.",
      routing_queue: "exec-briefings",
      customer_tone: "measured and practical",
    },
    completion:
      "Key Points:\n- Free-to-paid volume rose, but quality concentrated in enterprise-assisted journeys.\n- Self-serve uplift is real, yet expansion potential remains uneven.\n- Regional variance is widening faster than expected.",
    evaluations: [
      {
        id: "eval-cost",
        name: "Cost",
        status: "passed",
        reason: "Within budget.",
        scoreLabel: "$0.0011",
      },
      {
        id: "eval-judge",
        name: "LLM as a Judge",
        status: "unknown",
        reason: "Judge model quota was exhausted on this pass.",
        scoreLabel: "n/a",
      },
      {
        id: "eval-latency",
        name: "Latency",
        status: "passed",
        reason: "Met the latency frame.",
        scoreLabel: "7.0s",
      },
      {
        id: "eval-text",
        name: "Text Matcher",
        status: "passed",
        reason: "Required phrasing present.",
        scoreLabel: "1.00",
      },
    ],
  },
  {
    durationSeconds: 9,
    ttftSeconds: 1.7,
    costUsd: 0.0013,
    variables: {
      product_area: "Sales planning",
      issue_summary:
        "Regional pipeline summary should call out under-covered segments before weekly forecast review.",
      routing_queue: "revops",
      customer_tone: "direct and crisp",
    },
    completion:
      "Key Points:\n- SMB pipeline softness is still concentrated in Nordics and Benelux.\n- Enterprise coverage looks healthy, but stage velocity slowed in late quarter deals.\n- Sales-led follow-up needs to focus on mid-market expansion opportunities.",
    evaluations: [
      {
        id: "eval-cost",
        name: "Cost",
        status: "passed",
        reason: "Within budget.",
        scoreLabel: "$0.0013",
      },
      {
        id: "eval-judge",
        name: "LLM as a Judge",
        status: "passed",
        reason: "Actionable and appropriately concise.",
        scoreLabel: "0.80",
      },
      {
        id: "eval-latency",
        name: "Latency",
        status: "failed",
        reason: "Exceeded the 8 second latency guardrail.",
        scoreLabel: "9.0s",
      },
      {
        id: "eval-text",
        name: "Text Matcher",
        status: "passed",
        reason: "Expected structure intact.",
        scoreLabel: "1.00",
      },
    ],
  },
  {
    durationSeconds: 7,
    ttftSeconds: 1.0,
    costUsd: 0.001,
    variables: {
      product_area: "Revenue planning",
      issue_summary:
        "Executive readout needs a concise narrative on margin pressure and channel mix.",
      routing_queue: "finance-ops",
      customer_tone: "calm and executive",
    },
    completion:
      "Key Points:\n- Margin pressure is concentrated in the highest-volume acquisition channels.\n- Mix efficiency improved in EMEA, while NA remains flat.\n- The current trajectory supports a modest reallocation rather than a full channel reset.",
    evaluations: [
      {
        id: "eval-cost",
        name: "Cost",
        status: "passed",
        reason: "Within budget.",
        scoreLabel: "$0.0010",
      },
      {
        id: "eval-judge",
        name: "LLM as a Judge",
        status: "passed",
        reason: "Good executive framing with usable next actions.",
        scoreLabel: "0.84",
      },
      {
        id: "eval-latency",
        name: "Latency",
        status: "passed",
        reason: "Under the latency threshold.",
        scoreLabel: "7.0s",
      },
      {
        id: "eval-text",
        name: "Text Matcher",
        status: "passed",
        reason: "Headings and framing preserved.",
        scoreLabel: "1.00",
      },
    ],
  },
  {
    durationSeconds: 7,
    ttftSeconds: 1.3,
    costUsd: 0.001,
    variables: {
      product_area: "Marketing analytics",
      issue_summary:
        "Q4 campaigns launched focusing on social acquisition performance in social video inventory.",
      routing_queue: "growth-ops",
      customer_tone: "direct and crisp",
    },
    completion:
      "Key Points:\n- Social video inventory drove lower cost reach, but retention quality softened slightly.\n- Weekend inventory looks healthiest in the highest-velocity regions.",
    evaluations: [
      {
        id: "eval-cost",
        name: "Cost",
        status: "passed",
        reason: "Low cost response.",
        scoreLabel: "$0.0010",
      },
      {
        id: "eval-judge",
        name: "LLM as a Judge",
        status: "passed",
        reason: "Good balance of efficiency and outcome analysis.",
        scoreLabel: "0.81",
      },
      {
        id: "eval-latency",
        name: "Latency",
        status: "passed",
        reason: "Under SLO.",
        scoreLabel: "7.0s",
      },
      {
        id: "eval-text",
        name: "Text Matcher",
        status: "failed",
        reason:
          "Did not mention retention quality in the recommendations section.",
        scoreLabel: "0.00",
      },
    ],
  },
  {
    durationSeconds: 7,
    ttftSeconds: 1.1,
    costUsd: 0.001,
    variables: {
      product_area: "Lifecycle reporting",
      issue_summary:
        "Launch performance summary needs a clearer readout on activation conversion.",
      routing_queue: "exec-briefings",
      customer_tone: "measured and practical",
    },
    completion:
      "Key Points:\n- Activation improved in self-serve cohorts, but the uplift is not yet consistent in enterprise segments.\n- The strongest gains happened where onboarding was shortened.",
    evaluations: [
      {
        id: "eval-cost",
        name: "Cost",
        status: "passed",
        reason: "Below budget.",
        scoreLabel: "$0.0010",
      },
      {
        id: "eval-judge",
        name: "LLM as a Judge",
        status: "unknown",
        reason: "Judge run was skipped on the overnight batch.",
        scoreLabel: "n/a",
      },
      {
        id: "eval-latency",
        name: "Latency",
        status: "passed",
        reason: "Healthy latency.",
        scoreLabel: "7.0s",
      },
      {
        id: "eval-text",
        name: "Text Matcher",
        status: "passed",
        reason: "Structure matched the prompt spec.",
        scoreLabel: "1.00",
      },
    ],
  },
  {
    durationSeconds: 8,
    ttftSeconds: 1.5,
    costUsd: 0.0011,
    variables: {
      product_area: "Revenue planning",
      issue_summary:
        "Margin summary should isolate the impact of discount-heavy regional deals.",
      routing_queue: "finance-ops",
      customer_tone: "calm and executive",
    },
    completion:
      "Key Points:\n- Margin compression is tied to a small set of discount-heavy deals.\n- The broader regional mix remains healthy outside the exception cohort.",
    evaluations: [
      {
        id: "eval-cost",
        name: "Cost",
        status: "passed",
        reason: "Within target.",
        scoreLabel: "$0.0011",
      },
      {
        id: "eval-judge",
        name: "LLM as a Judge",
        status: "passed",
        reason: "Executive summary was clear and concise.",
        scoreLabel: "0.78",
      },
      {
        id: "eval-latency",
        name: "Latency",
        status: "failed",
        reason: "Exceeded the latency frame.",
        scoreLabel: "8.0s",
      },
      {
        id: "eval-text",
        name: "Text Matcher",
        status: "passed",
        reason: "Required framing present.",
        scoreLabel: "1.00",
      },
    ],
  },
];

const MONITOR_CALL_TIMESTAMPS = [
  minutesAgo(4),
  minutesAgo(7),
  minutesAgo(11),
  minutesAgo(14),
  minutesAgo(18),
  minutesAgo(22),
  minutesAgo(26),
  minutesAgo(31),
  minutesAgo(36),
  minutesAgo(42),
  minutesAgo(47),
  minutesAgo(53),
  minutesAgo(61),
  minutesAgo(74),
  minutesAgo(86),
  minutesAgo(99),
  minutesAgo(112),
  minutesAgo(127),
  minutesAgo(145),
  minutesAgo(167),
  minutesAgo(194),
  minutesAgo(221),
  minutesAgo(257),
  minutesAgo(304),
  minutesAgo(366),
  minutesAgo(428),
  minutesAgo(512),
  minutesAgo(685),
  minutesAgo(843),
  minutesAgo(1095),
  daysAgo(1, 15, 24),
  daysAgo(1, 10, 12),
  daysAgo(2, 16, 48),
  daysAgo(2, 9, 13),
  daysAgo(3, 9, 27),
  daysAgo(3, 13, 52),
  daysAgo(4, 13, 36),
  daysAgo(5, 17, 18),
  daysAgo(6, 8, 43),
  daysAgo(7, 12, 6),
  daysAgo(8, 14, 17),
  daysAgo(10, 11, 8),
  daysAgo(12, 18, 2),
  daysAgo(13, 9, 41),
  monthsAgo(1, 12, 9, 18),
  monthsAgo(1, 24, 15, 4),
  monthsAgo(2, 7, 15, 41),
  monthsAgo(2, 20, 11, 12),
  monthsAgo(3, 19, 10, 9),
  monthsAgo(4, 25, 13, 52),
  monthsAgo(5, 11, 8, 33),
  monthsAgo(6, 18, 16, 6),
  monthsAgo(7, 3, 11, 45),
  monthsAgo(8, 21, 14, 24),
  monthsAgo(9, 8, 9, 58),
  monthsAgo(10, 24, 17, 11),
  monthsAgo(11, 6, 12, 36),
].sort((a, b) => b.getTime() - a.getTime());

const MONITOR_CALLS: PromptCall[] = MONITOR_CALL_TIMESTAMPS.map(
  (startedAt, index) =>
    createPromptCall({
      id: `call-${String(index + 1).padStart(2, "0")}`,
      startedAt,
      ...MONITOR_CALL_TEMPLATES[index % MONITOR_CALL_TEMPLATES.length]!,
    }),
);

export default function PromptMonitorScreen() {
  const router = useRouter();
  const projectId = router.query.projectId as string | undefined;
  const { promptPath } = resolvePromptPreviewSlug(router.query.slug);
  const rightPanelRef = usePanelRef();
  const [selectedBucketLabel, setSelectedBucketLabel] = useState("");
  const [selectedCallId, setSelectedCallId] = useState("call-01");
  const [selectedRange, setSelectedRange] =
    useState<MonitorTimeRange>("Hourly");
  const [selectedTab, setSelectedTab] = useState<MonitorTab>("completion");
  const [isRollupCollapsed, setIsRollupCollapsed] = useState(false);
  const bucketSeries = buildMonitorBucketSeries(selectedRange, MONITOR_CALLS);
  const selectedBucket = bucketSeries.find(
    (bucket) => bucket.key === selectedBucketLabel,
  );
  const rangeCalls = MONITOR_CALLS.filter((call) =>
    bucketSeries.some(
      (bucket) => call.startedAt >= bucket.from && call.startedAt < bucket.to,
    ),
  );
  const filteredCalls = selectedBucket
    ? rangeCalls.filter(
        (call) =>
          call.startedAt >= selectedBucket.from &&
          call.startedAt < selectedBucket.to,
      )
    : [];
  const selectedCall =
    filteredCalls.find((call) => call.id === selectedCallId) ??
    filteredCalls[0];
  const activeModel =
    PREVIEW_MODELS.find((model) => model.id === selectedCall?.modelId) ??
    PREVIEW_MODELS[0]!;
  const selectedCallRaw = selectedCall
    ? JSON.stringify(
        buildRawCallPayload(selectedCall, activeModel.label),
        null,
        2,
      )
    : "{}";
  const selectedCallCounts = selectedCall
    ? summarizeEvaluations(selectedCall.evaluations)
    : { passed: 0, failed: 0, unknown: 0 };
  const bucketMaxCount = Math.max(
    ...bucketSeries.map((bucket) => bucket.count),
    1,
  );

  useEffect(() => {
    if (selectedBucket && filteredCalls.length > 0) {
      return;
    }

    const nextBucket =
      [...bucketSeries].reverse().find((bucket) => bucket.count > 0) ??
      bucketSeries.at(-1);
    if (nextBucket) {
      setSelectedBucketLabel(nextBucket.key);
    }
  }, [bucketSeries, filteredCalls.length, selectedBucket]);

  const handleToggleRollup = () => {
    if (!rightPanelRef.current) return;

    if (rightPanelRef.current.isCollapsed()) {
      rightPanelRef.current.expand();
    } else {
      rightPanelRef.current.collapse();
    }
  };

  if (!router.isReady || !projectId) {
    return null;
  }

  return (
    <PromptFrame
      projectId={projectId}
      breadcrumbs={getPromptBreadcrumbs(projectId, promptPath)}
      promptPath={promptPath}
      activeStage="monitor"
    >
      <div className="bg-background flex min-h-0 flex-1 flex-col overflow-hidden">
        <MonitorTimeline
          selectedBucketLabel={selectedBucketLabel}
          onSelectBucket={setSelectedBucketLabel}
          selectedRange={selectedRange}
          onSelectRange={setSelectedRange}
          bucketSeries={bucketSeries}
          bucketMaxCount={bucketMaxCount}
        />
        <div className="min-h-0 flex-1 overflow-hidden">
          <ResizablePanelGroup
            orientation="horizontal"
            className="hidden h-full w-full lg:flex"
          >
            <ResizablePanel defaultSize="26%" minSize="22%">
              <CompletionsPane
                calls={filteredCalls}
                selectedCallId={selectedCall?.id}
                onSelectCall={setSelectedCallId}
              />
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel defaultSize="51%" minSize="38%">
              {selectedCall ? (
                <PromptCallDetailPane
                  call={selectedCall}
                  activeModel={activeModel}
                  selectedTab={selectedTab}
                  onSelectTab={setSelectedTab}
                  rawJson={selectedCallRaw}
                  iterateHref={getPromptStageHref(
                    projectId,
                    promptPath,
                    "iterate",
                  )}
                />
              ) : (
                <EmptyMonitorState />
              )}
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel
              id="prompt-monitor-rollup"
              panelRef={rightPanelRef}
              defaultSize="23%"
              minSize="16%"
              collapsible={true}
              collapsedSize="72px"
              onResize={() => {
                setIsRollupCollapsed(
                  rightPanelRef.current?.isCollapsed() ?? false,
                );
              }}
            >
              {selectedCall ? (
                <PromptRollupPane
                  title={selectedCall.title}
                  activeModelLabel={toShortModelLabel(activeModel.label)}
                  providerIcon={activeModel.providerIcon}
                  callCount={filteredCalls.length}
                  deploymentId={selectedCall.deploymentId}
                  averageDuration={averageDuration(filteredCalls)}
                  averageCost={averageCost(filteredCalls)}
                  counts={selectedCallCounts}
                  recentCalls={filteredCalls}
                  selectedCallId={selectedCall.id}
                  onSelectCall={setSelectedCallId}
                  compact={isRollupCollapsed}
                  onToggleCollapse={handleToggleRollup}
                />
              ) : (
                <EmptyMonitorState compact />
              )}
            </ResizablePanel>
          </ResizablePanelGroup>

          <div className="flex min-h-0 w-full flex-col divide-y lg:hidden">
            <div className="min-h-[16rem] overflow-hidden">
              <CompletionsPane
                calls={filteredCalls}
                selectedCallId={selectedCall?.id}
                onSelectCall={setSelectedCallId}
              />
            </div>
            <div className="min-h-[26rem] overflow-hidden">
              {selectedCall ? (
                <PromptCallDetailPane
                  call={selectedCall}
                  activeModel={activeModel}
                  selectedTab={selectedTab}
                  onSelectTab={setSelectedTab}
                  rawJson={selectedCallRaw}
                  iterateHref={getPromptStageHref(
                    projectId,
                    promptPath,
                    "iterate",
                  )}
                />
              ) : (
                <EmptyMonitorState />
              )}
            </div>
            <div className="min-h-[16rem] overflow-hidden">
              {selectedCall ? (
                <PromptRollupPane
                  title={selectedCall.title}
                  activeModelLabel={toShortModelLabel(activeModel.label)}
                  providerIcon={activeModel.providerIcon}
                  callCount={filteredCalls.length}
                  deploymentId={selectedCall.deploymentId}
                  averageDuration={averageDuration(filteredCalls)}
                  averageCost={averageCost(filteredCalls)}
                  counts={selectedCallCounts}
                  recentCalls={filteredCalls}
                  selectedCallId={selectedCall.id}
                  onSelectCall={setSelectedCallId}
                />
              ) : (
                <EmptyMonitorState compact />
              )}
            </div>
          </div>
        </div>
      </div>
    </PromptFrame>
  );
}

function MonitorTimeline({
  selectedBucketLabel,
  onSelectBucket,
  selectedRange,
  onSelectRange,
  bucketSeries,
  bucketMaxCount,
}: {
  selectedBucketLabel: string;
  onSelectBucket: (value: string) => void;
  selectedRange: MonitorTimeRange;
  onSelectRange: (value: MonitorTimeRange) => void;
  bucketSeries: Array<{
    key: string;
    label: string;
    count: number;
    from: Date;
    to: Date;
  }>;
  bucketMaxCount: number;
}) {
  const totalCalls = bucketSeries.reduce(
    (sum, bucket) => sum + bucket.count,
    0,
  );

  return (
    <div className="border-b px-4 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-foreground truncate text-sm font-medium">
            Prompt calls
          </p>
          <p className="text-muted-foreground text-xs tabular-nums">
            {totalCalls} calls in view
          </p>
        </div>
        <div className="flex items-center gap-1">
          {MONITOR_TIME_RANGES.map((range) => (
            <button
              key={range}
              type="button"
              onClick={() => onSelectRange(range)}
              className={cn(
                "rounded-md px-2.5 py-1 text-sm font-medium transition-colors",
                selectedRange === range
                  ? "bg-emerald-100 text-emerald-900"
                  : "text-muted-foreground hover:bg-muted/55 hover:text-foreground",
              )}
            >
              {range}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3">
        <div
          className="grid [grid-template-columns:repeat(var(--bucket-count),minmax(0,1fr))] gap-x-3"
          style={
            {
              "--bucket-count": bucketSeries.length,
            } as CSSProperties
          }
        >
          {bucketSeries.map((bucket) => {
            const isSelected = bucket.key === selectedBucketLabel;
            const height = Math.max(
              8,
              Math.round((bucket.count / bucketMaxCount) * 54),
            );
            return (
              <button
                key={bucket.key}
                type="button"
                onClick={() => onSelectBucket(bucket.key)}
                className="flex min-w-0 flex-col items-center gap-1 text-center"
              >
                <div
                  className={cn(
                    "border-border/70 flex h-11 w-full items-end border-b px-[2px] pb-[2px]",
                    isSelected ? "bg-emerald-50/80" : "bg-transparent",
                  )}
                >
                  <div
                    className={cn(
                      "w-full rounded-[3px] transition-all",
                      isSelected ? "bg-emerald-700" : "bg-emerald-800/75",
                      bucket.count === 0 && "bg-border",
                    )}
                    style={{ height }}
                  />
                </div>
                <span className="text-muted-foreground text-[0.6875rem] tabular-nums">
                  {bucket.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CompletionsPane({
  calls,
  selectedCallId,
  onSelectCall,
}: {
  calls: PromptCall[];
  selectedCallId?: string;
  onSelectCall: (callId: string) => void;
}) {
  return (
    <div className="bg-background flex h-full min-h-0 flex-col">
      <div className="border-b px-4">
        <div className="flex h-14 items-center justify-between gap-3">
          <h2 className="text-foreground truncate text-sm font-medium">
            Completions
          </h2>
          <span className="text-muted-foreground text-xs tabular-nums">
            {calls.length}
          </span>
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="px-3 py-2.5">
          {calls.length === 0 ? (
            <div className="text-muted-foreground px-2 py-6 text-sm">
              No prompt calls in this bucket.
            </div>
          ) : (
            <ul role="list" className="space-y-1">
              {calls.map((call) => (
                <li key={call.id}>
                  <button
                    type="button"
                    onClick={() => onSelectCall(call.id)}
                    className={cn(
                      "w-full rounded-lg px-3 py-2.5 text-left transition-colors",
                      selectedCallId === call.id
                        ? "bg-muted/55 ring-border/80 ring-1"
                        : "hover:bg-muted/35",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="size-2 shrink-0 rounded-full bg-emerald-700" />
                        <p className="text-foreground truncate text-sm font-medium">
                          {call.title}
                        </p>
                      </div>
                      <p className="text-muted-foreground shrink-0 text-xs tabular-nums">
                        {call.relativeLabel}
                      </p>
                    </div>
                    <p className="text-muted-foreground mt-1 line-clamp-2 text-sm leading-5">
                      {call.completion}
                    </p>
                    <div className="text-muted-foreground mt-2 flex items-center gap-2 text-xs tabular-nums">
                      <span>{formatUsd(call.costUsd)}</span>
                      <span>{formatDuration(call.durationSeconds)}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function PromptCallDetailPane({
  call,
  activeModel,
  selectedTab,
  onSelectTab,
  rawJson,
  iterateHref,
}: {
  call: PromptCall;
  activeModel: (typeof PREVIEW_MODELS)[number];
  selectedTab: MonitorTab;
  onSelectTab: (value: MonitorTab) => void;
  rawJson: string;
  iterateHref: string;
}) {
  const counts = summarizeEvaluations(call.evaluations);
  const total = call.evaluations.length || 1;
  const passPercent = ((counts.passed / total) * 100).toFixed(2);
  const failPercent = ((counts.failed / total) * 100).toFixed(2);
  const unknownPercent = ((counts.unknown / total) * 100).toFixed(2);

  return (
    <div className="bg-background flex h-full min-h-0 flex-col">
      <div className="border-b px-4">
        <div className="flex h-14 items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-foreground truncate text-sm font-medium">
              {call.title}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link href={iterateHref}>
                <Play className="size-3.5" />
                Open in Playground
              </Link>
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Database className="size-3.5" />
              Add to Dataset
              <ChevronDown className="size-3.5" />
            </Button>
          </div>
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="px-4 py-3">
          <section className="grid grid-cols-2 gap-x-5 gap-y-4 border-b pb-4 sm:grid-cols-4">
            <MetricCell label="Start" value={call.startedAtLabel} />
            <MetricCell
              label="Duration"
              value={formatDuration(call.durationSeconds)}
            />
            <MetricCell
              label="Time-to-First-Token"
              value={formatDuration(call.ttftSeconds)}
            />
            <MetricCell
              label="Estimated cost"
              value={formatUsd(call.costUsd)}
            />
          </section>
          <section className="grid grid-cols-1 gap-4 border-b py-4 sm:grid-cols-3">
            <MetricCell label="Passed" value={`${passPercent}%`} />
            <MetricCell label="Failed" value={`${failPercent}%`} />
            <MetricCell label="Unknown" value={`${unknownPercent}%`} />
          </section>
          <section className="grid grid-cols-1 gap-4 py-4 sm:grid-cols-3">
            <MetricCell label="Deployment ID" value={call.deploymentId} mono />
            <MetricCell
              label="Model"
              value={toShortModelLabel(activeModel.label)}
            />
            <MetricCell label="Environment" value={call.environmentLabel} />
          </section>
          <Tabs
            value={selectedTab}
            onValueChange={(value) => onSelectTab(value as MonitorTab)}
            className="mt-0.5"
          >
            <TabsList className="bg-muted/55 h-auto rounded-lg p-1">
              <TabsTrigger value="completion">Completion</TabsTrigger>
              <TabsTrigger value="variables">Variables</TabsTrigger>
              <TabsTrigger value="evaluations">Evaluations</TabsTrigger>
              <TabsTrigger value="raw">Raw</TabsTrigger>
            </TabsList>
            <TabsContent value="completion" className="mt-3 space-y-3">
              <div className="border-border/70 rounded-xl border px-4 py-3">
                <p className="text-foreground text-sm leading-6 whitespace-pre-wrap">
                  {call.completion}
                </p>
              </div>
            </TabsContent>
            <TabsContent value="variables" className="mt-3">
              <div className="border-border/70 divide-border/70 divide-y rounded-xl border">
                {Object.entries(call.variables).map(([key, value]) => (
                  <div
                    key={key}
                    className="grid grid-cols-[9rem_minmax(0,1fr)] gap-4 px-4 py-2.5"
                  >
                    <div className="text-muted-foreground text-sm">{key}</div>
                    <div className="text-foreground text-sm leading-6">
                      {value}
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>
            <TabsContent value="evaluations" className="mt-3">
              <div className="space-y-2">
                {call.evaluations.map((evaluation) => (
                  <div
                    key={evaluation.id}
                    className="border-border/70 rounded-xl border px-4 py-2.5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <EvaluationBadge status={evaluation.status} />
                        <p className="text-foreground text-sm font-medium">
                          {evaluation.name}
                        </p>
                      </div>
                      <p className="text-muted-foreground text-sm tabular-nums">
                        {evaluation.scoreLabel}
                      </p>
                    </div>
                    <p className="text-muted-foreground mt-2 text-sm leading-6">
                      {evaluation.reason}
                    </p>
                  </div>
                ))}
              </div>
            </TabsContent>
            <TabsContent value="raw" className="mt-3">
              <CodeMirrorEditor
                value={rawJson}
                mode="json"
                editable={false}
                lineNumbers={false}
                maxHeight={300}
                className="border-border/70 bg-background text-sm"
              />
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>
    </div>
  );
}

function PromptRollupPane({
  title,
  activeModelLabel,
  providerIcon,
  callCount,
  deploymentId,
  averageDuration,
  averageCost,
  counts,
  recentCalls,
  selectedCallId,
  onSelectCall,
  compact,
  onToggleCollapse,
}: {
  title: string;
  activeModelLabel: string;
  providerIcon: string;
  callCount: number;
  deploymentId: string;
  averageDuration: number;
  averageCost: number;
  counts: { passed: number; failed: number; unknown: number };
  recentCalls: PromptCall[];
  selectedCallId: string;
  onSelectCall: (callId: string) => void;
  compact: boolean;
  onToggleCollapse: () => void;
}) {
  if (compact) {
    return (
      <div className="bg-background flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
        <div className="border-b px-2 py-2">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={onToggleCollapse}
            aria-label="Expand prompt rollup"
          >
            <ChevronLeft className="size-4" />
          </Button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col items-center gap-4 px-2 py-3">
          <div className="flex flex-col items-center gap-1 text-center">
            <Image
              src={providerIcon}
              alt=""
              width={16}
              height={16}
              className="size-4 rounded-sm"
              unoptimized
            />
            <span className="text-muted-foreground text-[0.6875rem] font-medium tabular-nums">
              {callCount}
            </span>
          </div>
          <div className="flex flex-col items-center gap-3">
            <CompactHealthPill label="P" value={counts.passed} tone="passed" />
            <CompactHealthPill label="F" value={counts.failed} tone="failed" />
            <CompactHealthPill
              label="U"
              value={counts.unknown}
              tone="unknown"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <div className="border-b px-3.5">
        <div className="flex h-14 items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="size-2 shrink-0 rounded-full bg-emerald-700" />
            <h2 className="text-foreground truncate text-sm font-medium">
              {title}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
              {callCount}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              onClick={onToggleCollapse}
              aria-label="Collapse prompt rollup"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>
      <ScrollArea className="radix-scroll-inner-fluid min-h-0 min-w-0 flex-1 overflow-x-hidden">
        <div className="min-w-0 space-y-3 overflow-x-hidden px-3.5 py-3">
          <div className="border-b pb-3">
            <div className="flex min-w-0 items-center gap-2">
              <Image
                src={providerIcon}
                alt=""
                width={16}
                height={16}
                className="size-4 rounded-sm"
                unoptimized
              />
              <p className="text-foreground min-w-0 truncate text-sm font-medium">
                {activeModelLabel}
              </p>
            </div>
            <p className="text-muted-foreground mt-1 truncate text-xs tabular-nums">
              {deploymentId.slice(0, 8)}…
            </p>
            <div className="text-muted-foreground mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
              <div>
                <div className="text-foreground tabular-nums">
                  {formatUsd(averageCost)}
                </div>
                <div>Avg cost</div>
              </div>
              <div>
                <div className="text-foreground tabular-nums">
                  {formatDuration(averageDuration)}
                </div>
                <div>Avg duration</div>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-muted-foreground text-xs font-medium">
              Evaluation health
            </p>
            <div className="divide-border/70 divide-y">
              <HealthRow label="Passed" value={counts.passed} tone="passed" />
              <HealthRow label="Failed" value={counts.failed} tone="failed" />
              <HealthRow
                label="Unknown"
                value={counts.unknown}
                tone="unknown"
              />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-muted-foreground text-xs font-medium">
              Calls in this bucket
            </p>
            <div className="space-y-1">
              {recentCalls.map((call) => (
                <button
                  key={call.id}
                  type="button"
                  onClick={() => onSelectCall(call.id)}
                  className={cn(
                    "w-full min-w-0 rounded-lg px-3 py-2.5 text-left transition-colors",
                    selectedCallId === call.id
                      ? "bg-muted/55 ring-border/80 ring-1"
                      : "hover:bg-muted/35",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-foreground truncate text-sm font-medium">
                      {call.startedAtLabel}
                    </p>
                    <p className="text-muted-foreground text-xs tabular-nums">
                      {formatDuration(call.durationSeconds)}
                    </p>
                  </div>
                  <p className="text-muted-foreground mt-1 truncate text-sm">
                    {call.variables.issue_summary}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

function MetricCell({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p
        className={cn(
          "text-foreground truncate text-base font-semibold",
          mono && "font-mono text-base",
          /\d/.test(value) && "tabular-nums",
        )}
      >
        {value}
      </p>
      <p className="text-muted-foreground mt-0.5 text-[0.6875rem]">{label}</p>
    </div>
  );
}

function EvaluationBadge({ status }: { status: EvaluationStatus }) {
  if (status === "passed") {
    return (
      <Badge variant="success" className="gap-1 rounded-full px-2 py-0.5">
        <CheckCircle2 className="size-3.5" />
        Passed
      </Badge>
    );
  }

  if (status === "failed") {
    return (
      <Badge variant="error" className="gap-1 rounded-full px-2 py-0.5">
        <XCircle className="size-3.5" />
        Failed
      </Badge>
    );
  }

  return (
    <Badge variant="outline-solid" className="rounded-full px-2 py-0.5">
      Unknown
    </Badge>
  );
}

function HealthRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "passed" | "failed" | "unknown";
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="text-foreground text-sm">{label}</span>
      <span
        className={cn(
          "text-sm font-medium tabular-nums",
          tone === "passed" && "text-emerald-700",
          tone === "failed" && "text-rose-700",
          tone === "unknown" && "text-muted-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function CompactHealthPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "passed" | "failed" | "unknown";
}) {
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <span className="text-muted-foreground text-[0.625rem] font-medium">
        {label}
      </span>
      <span
        className={cn(
          "text-[0.6875rem] font-semibold tabular-nums",
          tone === "passed" && "text-emerald-700",
          tone === "failed" && "text-rose-700",
          tone === "unknown" && "text-muted-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function EmptyMonitorState({ compact = false }: { compact?: boolean }) {
  return (
    <div className="text-muted-foreground flex h-full items-center justify-center px-6 text-sm">
      {compact
        ? "Select a prompt call to inspect its monitoring details."
        : "Select a prompt call to inspect metrics, evaluations, and raw payloads."}
    </div>
  );
}

function createPromptCall(
  input: Omit<
    PromptCall,
    | "title"
    | "modelId"
    | "deploymentId"
    | "environmentLabel"
    | "bucketLabel"
    | "startedAtLabel"
    | "relativeLabel"
  >,
): PromptCall {
  return {
    title: "Product Performance Metrics",
    modelId: PREVIEW_MODELS[0]!.id,
    deploymentId: MONITOR_DEPLOYMENT_ID,
    environmentLabel: "Production",
    bucketLabel: formatMonitorBucketLabel(input.startedAt),
    startedAtLabel: formatMonitorStartedAtLabel(input.startedAt),
    relativeLabel: formatMonitorRelativeLabel(input.startedAt),
    ...input,
  };
}

function minutesAgo(minutes: number) {
  return new Date(MONITOR_NOW.getTime() - minutes * 60 * 1000);
}

function daysAgo(days: number, hour: number, minute: number) {
  const value = new Date(MONITOR_NOW);
  value.setDate(value.getDate() - days);
  value.setHours(hour, minute, 0, 0);
  return value;
}

function monthsAgo(months: number, day: number, hour: number, minute: number) {
  const value = new Date(MONITOR_NOW);
  value.setMonth(value.getMonth() - months, day);
  value.setHours(hour, minute, 0, 0);
  return value;
}

function formatMonitorBucketLabel(value: Date) {
  return value.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatMonitorStartedAtLabel(value: Date) {
  const [time, meridiem] = value
    .toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
    .split(" ");

  return `${time} ${meridiem?.toLowerCase() ?? ""} · ${value.toLocaleDateString(
    "en-US",
    {
      month: "short",
      day: "numeric",
      year: "numeric",
    },
  )}`;
}

function formatMonitorRelativeLabel(value: Date) {
  const diffMs = MONITOR_NOW.getTime() - value.getTime();
  const diffHours = Math.max(0, Math.floor(diffMs / (60 * 60 * 1000)));
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  }

  const diffDays = Math.max(1, Math.floor(diffMs / (24 * 60 * 60 * 1000)));
  if (diffDays < 31) {
    return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
  }

  const diffMonths =
    (MONITOR_NOW.getFullYear() - value.getFullYear()) * 12 +
    (MONITOR_NOW.getMonth() - value.getMonth());
  const normalizedMonths = Math.max(diffMonths, 1);
  return `${normalizedMonths} month${normalizedMonths === 1 ? "" : "s"} ago`;
}

function buildMonitorBucketSeries(
  range: MonitorTimeRange,
  calls: PromptCall[],
): Array<{
  key: string;
  label: string;
  count: number;
  from: Date;
  to: Date;
}> {
  const buckets = createMonitorBuckets(range);

  return buckets.map((bucket) => ({
    ...bucket,
    count: calls.filter(
      (call) => call.startedAt >= bucket.from && call.startedAt < bucket.to,
    ).length,
  }));
}

function createMonitorBuckets(range: MonitorTimeRange) {
  if (range === "Hourly") {
    return Array.from({ length: 24 }, (_, index) => {
      const from = new Date(MONITOR_NOW);
      from.setMinutes(0, 0, 0);
      from.setHours(from.getHours() - (24 - index));
      const to = new Date(from);
      to.setHours(to.getHours() + 1);

      return {
        key: from.toISOString(),
        label: from.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }),
        from,
        to,
      };
    });
  }

  if (range === "Daily") {
    return Array.from({ length: 14 }, (_, index) => {
      const from = new Date(MONITOR_NOW);
      from.setHours(0, 0, 0, 0);
      from.setDate(from.getDate() - (13 - index));
      const to = new Date(from);
      to.setDate(to.getDate() + 1);

      return {
        key: from.toISOString(),
        label: from.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        from,
        to,
      };
    });
  }

  return Array.from({ length: 12 }, (_, index) => {
    const from = new Date(MONITOR_NOW);
    from.setHours(0, 0, 0, 0);
    from.setDate(1);
    from.setMonth(from.getMonth() - (11 - index));
    const to = new Date(from);
    to.setMonth(to.getMonth() + 1);

    return {
      key: from.toISOString(),
      label: from.toLocaleDateString("en-US", {
        month: "short",
      }),
      from,
      to,
    };
  });
}

function summarizeEvaluations(evaluations: PromptCallEvaluation[]) {
  return evaluations.reduce(
    (acc, evaluation) => {
      acc[evaluation.status] += 1;
      return acc;
    },
    { passed: 0, failed: 0, unknown: 0 },
  );
}

function buildRawCallPayload(call: PromptCall, modelLabel: string) {
  return {
    id: call.id,
    prompt: call.title,
    model: modelLabel,
    deploymentId: call.deploymentId,
    environment: call.environmentLabel,
    startedAt: call.startedAtLabel,
    durationSeconds: call.durationSeconds,
    timeToFirstTokenSeconds: call.ttftSeconds,
    costUsd: call.costUsd,
    messages: PREVIEW_PROMPT_MESSAGES,
    variables: call.variables,
    completion: call.completion,
    evaluations: call.evaluations,
  };
}

function averageDuration(calls: PromptCall[]) {
  if (calls.length === 0) return 0;
  return (
    calls.reduce((sum, call) => sum + call.durationSeconds, 0) / calls.length
  );
}

function averageCost(calls: PromptCall[]) {
  if (calls.length === 0) return 0;
  return calls.reduce((sum, call) => sum + call.costUsd, 0) / calls.length;
}

function formatUsd(value: number) {
  return `$${value.toFixed(4)}`;
}

function formatDuration(value: number) {
  return `${value.toFixed(value < 2 ? 1 : 0)} s`;
}

function toShortModelLabel(value: string) {
  return value.split("::").at(-1) ?? value;
}
