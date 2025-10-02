import * as React from "react";
import { cn } from "@/src/utils/tailwind";
import {
  type ScoreSourceType,
  type CategoricalAggregate,
  type NumericAggregate,
} from "@langfuse/shared";
import { MessageCircleMore } from "lucide-react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { api } from "@/src/utils/api";
import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import { Skeleton } from "@/src/components/ui/skeleton";

const resolveScoreValue = (
  aggregate: CategoricalAggregate | NumericAggregate,
): string => {
  if (aggregate.type === "NUMERIC") {
    return aggregate.average.toFixed(4);
  }
  return aggregate.values.map((value) => value).join(", ");
};

const ScoreRowContent = ({
  name,
  aggregate,
}: {
  name: string;
  aggregate: CategoricalAggregate | NumericAggregate | null;
}) => {
  return (
    <div
      className={cn(
        "flex w-full flex-row justify-between gap-2",
        aggregate ? "cursor-pointer" : "",
      )}
    >
      <span
        className={cn(
          "min-w-16 max-w-[50%] flex-shrink-0 truncate",
          aggregate ? "font-medium" : "text-muted-foreground",
        )}
      >
        {name}
      </span>
      <div className="flex flex-row items-center gap-1">
        {aggregate ? (
          aggregate.values.map((value) => (
            <div className="line-clamp-1 font-medium" key={value}>
              {resolveScoreValue(aggregate)}
            </div>
          ))
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
        {aggregate?.comment ? (
          <MessageCircleMore size={12} className="flex-shrink-0" />
        ) : (
          <div className="h-4 w-4 flex-shrink-0" />
        )}
      </div>
    </div>
  );
};

export const ScoreRow = ({
  projectId,
  name,
  source,
  aggregate,
}: {
  projectId: string;
  name: string;
  source: ScoreSourceType;
  aggregate: CategoricalAggregate | NumericAggregate | null;
}) => {
  const [isHovered, setIsHovered] = React.useState(false);

  // ensure only loaded if user actually just hovered over the score
  const { data: metadata } = api.scores.getScoreMetadataById.useQuery(
    {
      projectId,
      id: aggregate?.id as string,
    },
    {
      enabled:
        isHovered &&
        Boolean(aggregate && aggregate.id && aggregate.hasMetadata),
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
    },
  );

  if (!aggregate) {
    return <ScoreRowContent name={name} aggregate={aggregate} />;
  }

  return (
    <HoverCard openDelay={300} closeDelay={100} onOpenChange={setIsHovered}>
      <HoverCardTrigger asChild>
        <div className="group/io-cell relative h-full w-full">
          <ScoreRowContent name={name} aggregate={aggregate} />
        </div>
      </HoverCardTrigger>
      <HoverCardContent
        className="grid max-h-[40vh] w-[300px] grid-cols-1 gap-1 overflow-y-auto text-xs"
        side="top"
        align="start"
      >
        <span className="mb-1 font-medium">{name}</span>
        <div className="flex flex-row justify-between gap-2">
          <span className="w-14">Value</span>
          <span>{resolveScoreValue(aggregate)}</span>
        </div>
        <div className="flex flex-row justify-between gap-2">
          <span className="w-14">Source</span>
          <span>{source}</span>
        </div>
        {aggregate.comment && (
          <div className="flex flex-row justify-between gap-2">
            <span className="w-14">Comment</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="line-clamp-1 cursor-help">
                  {aggregate.comment}
                </span>
              </TooltipTrigger>
              <TooltipContent className="min-w-[100px] max-w-xs break-words text-xs">
                {aggregate.comment}
              </TooltipContent>
            </Tooltip>
          </div>
        )}
        {aggregate.hasMetadata && (
          <div className="flex flex-row justify-between gap-2">
            <span className="w-14">Metadata</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="line-clamp-1 cursor-help">
                  {(() => {
                    try {
                      return metadata && Object.keys(metadata).length > 0
                        ? JSON.stringify(metadata)
                        : "Loading...";
                    } catch {
                      return "Invalid JSON";
                    }
                  })()}
                </span>
              </TooltipTrigger>
              <TooltipContent className="w-[400px] break-words text-xs">
                {metadata && Object.keys(metadata).length > 0 ? (
                  <JSONView
                    codeClassName="border-none p-0 overflow-y-auto max-h-[40vh]"
                    json={metadata}
                  />
                ) : (
                  <Skeleton className="h-12 w-full" />
                )}
              </TooltipContent>
            </Tooltip>
          </div>
        )}
      </HoverCardContent>
    </HoverCard>
  );
};
