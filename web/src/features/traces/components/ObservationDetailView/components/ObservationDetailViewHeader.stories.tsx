import { fn } from "storybook/test";
import {
  ChevronDown,
  EllipsisVertical,
  ListPlus,
  MessageSquare,
  Plus,
  SquarePen,
  Terminal,
} from "lucide-react";

import preview from "../../../../../../.storybook/preview";
import { ActionButtonCountBadge } from "@/src/components/ui/action-button-count-badge";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import {
  EnvironmentBadge,
  LatencyBadge,
  LevelBadge,
  ReleaseBadge,
  TimeToFirstTokenBadge,
  VersionBadge,
} from "@/src/features/traces/components/ObservationMetadataBadgesSimple/ObservationMetadataBadgesSimple";
import {
  CostBadge,
  UsageBadge,
} from "@/src/features/traces/components/ObservationMetadataBadgesTooltip";
import { ModelParametersBadges } from "./ModelParametersBadges";
import {
  ObservationDetailViewHeader,
  type ObservationDetailViewHeaderProps,
} from "./ObservationDetailViewHeader";

const openOptions = fn();
const addToDatasets = fn();
const annotate = fn();
const addToQueue = fn();
const openPlayground = fn();
const addComment = fn();

const titleActions = (
  <Button
    aria-label="Options"
    title="Options"
    variant="ghost"
    size="icon-xs"
    onClick={openOptions}
  >
    <EllipsisVertical className="h-4 w-4" />
  </Button>
);

const toolbarActions = (
  <>
    <Button variant="secondary" size="sm" onClick={addToDatasets}>
      <Plus className="mr-1.5 h-3.5 w-3.5" />
      Add to datasets
    </Button>
    <div className="flex items-start">
      <Button
        variant="secondary"
        size="sm"
        className="rounded-r-none"
        onClick={annotate}
      >
        <SquarePen className="mr-1.5 h-3.5 w-3.5" />
        Annotate
      </Button>
      <Button
        aria-label="Add to queue"
        variant="secondary"
        size="sm"
        className="rounded-l-none rounded-r-md border-l-2"
        onClick={addToQueue}
      >
        <ChevronDown className="h-3 w-3" />
      </Button>
    </div>
    <Button variant="secondary" size="sm" onClick={openPlayground}>
      <Terminal className="h-3.5 w-3.5" />
      Playground
      <ChevronDown className="h-3 w-3" />
    </Button>
    <Button variant="secondary" size="sm" onClick={addComment}>
      <MessageSquare className="h-3.5 w-3.5" />
      Add comment
      <ActionButtonCountBadge count={3} />
    </Button>
  </>
);

const mobileMenuActions = (
  <>
    <Button
      variant="ghost"
      size="sm"
      className="w-full justify-start gap-2 font-normal"
      onClick={addToDatasets}
    >
      <Plus className="h-4 w-4" />
      Add to datasets
    </Button>
    <Button
      variant="ghost"
      size="sm"
      className="w-full justify-start gap-2 font-normal"
      onClick={annotate}
    >
      <SquarePen className="h-4 w-4" />
      Annotate
    </Button>
    <Button
      variant="ghost"
      size="sm"
      className="w-full justify-start gap-2 font-normal"
      onClick={addToQueue}
    >
      <ListPlus className="h-4 w-4" />
      Add to queue
    </Button>
    <Button
      variant="ghost"
      size="sm"
      className="w-full justify-start gap-2 font-normal"
      onClick={openPlayground}
    >
      <Terminal className="h-4 w-4" />
      Test in playground
    </Button>
    <Button
      variant="ghost"
      size="sm"
      className="w-full justify-start gap-2 font-normal"
      onClick={addComment}
    >
      <MessageSquare className="h-4 w-4" />
      Add comment
      <ActionButtonCountBadge count={3} />
    </Button>
  </>
);

const commonBadges = (
  <>
    <LatencyBadge latencySeconds={1.284} />
    <TimeToFirstTokenBadge timeToFirstToken={0.342} />
    <Badge variant="tertiary">Session: support-session-42</Badge>
    <Badge variant="tertiary">User: customer-123</Badge>
    <EnvironmentBadge environment="production" />
    <ReleaseBadge release="2026.08.25" />
    <CostBadge
      totalCost={0.00342}
      costDetails={{ input: 0.0012, output: 0.00222, total: 0.00342 }}
    />
    <UsageBadge
      type="GENERATION"
      inputUsage={428}
      outputUsage={96}
      totalUsage={524}
      usageDetails={{ input: 428, output: 96, total: 524 }}
    />
    <VersionBadge version="1.4.0" />
    <Badge variant="tertiary">Model: example-model</Badge>
    <ModelParametersBadges
      modelParameters={{ temperature: 0.2, max_tokens: 512 }}
    />
  </>
);

const meta = preview.meta({ component: ObservationDetailViewHeader });

const defaultArgs = {
  observationType: "GENERATION",
  title: "customer-support-answer",
  startTime: new Date("2026-08-25T10:24:31.842Z"),
  titleActions,
  toolbarActions,
  mobileMenuActions,
  badges: commonBadges,
} satisfies ObservationDetailViewHeaderProps;

export const Default = meta.story({ args: defaultArgs });

export const Error = meta.story({
  args: {
    ...defaultArgs,
    badges: (
      <>
        {commonBadges}
        <LevelBadge level="ERROR" />
      </>
    ),
  },
});
