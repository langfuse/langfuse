import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";
import {
  type CategoricalAggregate,
  type NumericAggregate,
} from "@langfuse/shared";

import { numberFormatter } from "@/src/utils/numbers";
import { cn } from "@/src/utils/tailwind";
import { BracesIcon, MessageCircleMore } from "lucide-react";
import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import { api } from "@/src/utils/api";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { Skeleton } from "@/src/components/ui/skeleton";
import React from "react";

const COLOR_MAP = new Map([
  ["True", "bg-light-green p-0.5 text-dark-green"],
  ["False", "bg-light-red p-0.5 text-dark-red"],
]);
const COLLAPSE_CATEGORICAL_SCORES_AFTER = 2;

const ScoreValueCounts = ({
  valueCounts,
  wrap,
}: {
  valueCounts: CategoricalAggregate["valueCounts"];
  wrap: boolean;
}) => {
  return valueCounts.map(({ value, count }, index) => (
    <div key={value} className="flex flex-row">
      <span className="truncate">{value}</span>
      <span>{`: ${numberFormatter(count, 0)}`}</span>
      {!wrap && index < valueCounts.length - 1 && (
        <span className="mr-1">{";"}</span>
      )}
    </div>
  ));
};

export const ScoresTableCell = ({
  aggregate,
  showSingleValue = false,
  wrap = true,
  hasMetadata,
}: {
  aggregate: CategoricalAggregate | NumericAggregate;
  showSingleValue?: boolean;
  wrap?: boolean;
  hasMetadata?: boolean;
}) => {
  const projectId = useProjectIdFromURL();

  if (showSingleValue && aggregate.values.length === 1 && projectId) {
    const value =
      aggregate.type === "NUMERIC"
        ? aggregate.average.toFixed(4)
        : aggregate.values[0];

    return (
      <span
        className={cn("flex flex-row gap-0.5 rounded-sm", COLOR_MAP.get(value))}
      >
        {value}
        {aggregate.comment && (
          <HoverCard>
            <HoverCardTrigger className="inline-block cursor-pointer">
              <MessageCircleMore size={12} />
            </HoverCardTrigger>
            <HoverCardContent className="overflow-hidden whitespace-normal break-normal">
              <p>{aggregate.comment}</p>
            </HoverCardContent>
          </HoverCard>
        )}
        {hasMetadata && !!aggregate.id && (
          <AggregateScoreMetadataPeek
            scoreId={aggregate.id}
            projectId={projectId}
          />
        )}
      </span>
    );
  }

  if (aggregate.type === "NUMERIC") {
    return (
      <span className="rounded-sm">{`Ø ${aggregate.average.toFixed(4)}`}</span>
    );
  }

  return (
    <div className="group">
      {aggregate.valueCounts.length > COLLAPSE_CATEGORICAL_SCORES_AFTER ? (
        <HoverCard>
          <HoverCardTrigger>
            <div className="flex cursor-pointer flex-col group-hover:text-accent-dark-blue/55">
              <ScoreValueCounts
                valueCounts={aggregate.valueCounts.slice(
                  0,
                  COLLAPSE_CATEGORICAL_SCORES_AFTER,
                )}
                wrap={wrap}
              />
            </div>
          </HoverCardTrigger>
          <HoverCardContent className="z-20 flex max-h-[40vh] max-w-64 flex-col overflow-y-auto whitespace-normal break-normal">
            <ScoreValueCounts valueCounts={aggregate.valueCounts} wrap={wrap} />
          </HoverCardContent>
        </HoverCard>
      ) : (
        <div className={cn("flex", wrap ? "flex-col" : "flex-row")}>
          <ScoreValueCounts valueCounts={aggregate.valueCounts} wrap={wrap} />
        </div>
      )}
    </div>
  );
};

function AggregateScoreMetadataPeek({
  scoreId,
  projectId,
}: {
  scoreId: string;
  projectId: string;
}) {
  const [isOpen, setIsOpen] = React.useState(false);

  const { data: metadata } = api.scores.getScoreMetadataById.useQuery(
    {
      projectId,
      id: scoreId,
    },
    {
      enabled: !!projectId && !!scoreId && isOpen,
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
    },
  );

  const metadataLoaded = metadata && Object.keys(metadata).length > 0;

  return (
    <HoverCard onOpenChange={setIsOpen}>
      <HoverCardTrigger className="inline-block cursor-pointer">
        <BracesIcon size={12} />
      </HoverCardTrigger>
      <HoverCardContent className="overflow-hidden whitespace-normal break-normal rounded-md border-none p-0">
        {metadataLoaded ? (
          <JSONView codeClassName="!rounded-md" json={metadata} />
        ) : (
          <Skeleton className="h-12 w-full" />
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
