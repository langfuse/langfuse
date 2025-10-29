import * as React from "react";
import { cn } from "@/src/utils/tailwind";
import {
  type ScoreSourceType,
  type AggregatedScoreData,
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

const resolveScoreValue = (aggregate: AggregatedScoreData): string => {
  if (aggregate.type === "NUMERIC") {
    return aggregate.average.toFixed(4);
  }
  return aggregate.values.map((value: string) => value).join(", ");
};

const ScoreDetailRow = ({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) => (
  <div className="flex justify-between gap-2">
    <span className="w-14 font-medium text-muted-foreground">{label}</span>
    <div className="min-w-0 flex-1 text-right">
      {typeof value === "string" ? (
        <span className="break-words">{value}</span>
      ) : (
        value
      )}
    </div>
  </div>
);

const ScoreRowContent = ({
  name,
  aggregate,
}: {
  name: string;
  aggregate: AggregatedScoreData | null;
}) => {
  return (
    <div
      className={cn(
        "flex w-full items-center justify-between gap-2",
        aggregate && "cursor-pointer",
      )}
    >
      <span
        className={cn(
          "min-w-16 flex-1 truncate",
          aggregate ? "font-medium" : "text-muted-foreground",
        )}
      >
        {name}
      </span>
      <div className="flex flex-shrink-0 items-center gap-1">
        {aggregate ? (
          <span className="line-clamp-1 font-medium">
            {resolveScoreValue(aggregate)}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">-</span>
        )}
        <div className="flex h-3 w-3 items-center justify-center">
          {aggregate?.comment && (
            <MessageCircleMore size={12} className="text-muted-foreground" />
          )}
        </div>
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
  aggregate: AggregatedScoreData | null;
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
    <HoverCard openDelay={700} closeDelay={100} onOpenChange={setIsHovered}>
      <HoverCardTrigger asChild>
        <div className="group/io-cell relative h-full w-full">
          <ScoreRowContent name={name} aggregate={aggregate} />
        </div>
      </HoverCardTrigger>
      <HoverCardContent
        className="max-h-[40vh] w-[300px] overflow-y-auto"
        side="top"
        align="start"
      >
        <div className="space-y-3">
          <h4 className="text-sm font-medium">{name}</h4>

          <div className="space-y-2 text-xs">
            <ScoreDetailRow
              label="Value"
              value={resolveScoreValue(aggregate)}
            />
            <ScoreDetailRow label="Source" value={source} />

            {aggregate.comment && (
              <ScoreDetailRow
                label="Comment"
                value={
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="line-clamp-2 cursor-help">
                        {aggregate.comment}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-sm">
                      <p className="whitespace-pre-wrap text-xs">
                        {aggregate.comment}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                }
              />
            )}

            {aggregate.hasMetadata && (
              <ScoreDetailRow
                label="Metadata"
                value={
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
                }
              />
            )}
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
};
