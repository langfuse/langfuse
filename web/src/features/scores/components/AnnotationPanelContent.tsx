import { type ReactNode } from "react";
import {
  filterAndValidateDbScoreList,
  ScoreDataTypeArray,
  ScoreDataTypeEnum,
} from "@langfuse/shared";
import { Button } from "@/src/components/ui/button";
import { Skeleton } from "@/src/components/ui/skeleton";
import Header from "@/src/components/layouts/header";
import { api } from "@/src/utils/api";
import { toDomainArrayWithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";
import { AnnotationForm } from "./AnnotationForm";
import { DualAnnotationContent } from "./DualAnnotationContent";
import { type AnnotationPanelData } from "../types";

export function AnnotationPanelContent({
  data,
  actionButtons,
  isActive,
}: {
  data: AnnotationPanelData;
  actionButtons: ReactNode;
  isActive: boolean;
}) {
  const target = data.scoreTarget;
  const scoresQuery = api.events.scoresForTrace.useQuery(
    {
      projectId: data.scoreMetadata.projectId,
      traceId: target.type === "trace" ? target.traceId : "",
    },
    {
      enabled: data.scores === undefined && target.type === "trace",
      staleTime: 60 * 1000,
    },
  );
  const fetchedScores =
    scoresQuery.data && target.type === "trace"
      ? toDomainArrayWithStringifiedMetadata(
          filterAndValidateDbScoreList({
            scores: scoresQuery.data,
            dataTypes: [...ScoreDataTypeArray],
            onParseError: (error) => console.error(error),
          }).filter(
            (score) =>
              score.dataType !== ScoreDataTypeEnum.CORRECTION &&
              (target.observationId
                ? score.observationId === target.observationId
                : !score.observationId),
          ),
        )
      : undefined;
  const scores = data.scores ?? fetchedScores;

  if (scores === undefined) {
    return (
      <div className="flex flex-col gap-4">
        <Header title="Annotate" actionButtons={[actionButtons]} />
        {scoresQuery.isError ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm">Could not load scores.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => scoresQuery.refetch()}
            >
              Try again
            </Button>
          </div>
        ) : (
          <Skeleton className="h-48 w-full" />
        )}
      </div>
    );
  }

  return data.companionTrace &&
    target.type === "trace" &&
    target.observationId ? (
    <DualAnnotationContent
      projectId={data.scoreMetadata.projectId}
      isV4={data.analyticsData.isV4}
      traceId={target.traceId}
      observationId={target.observationId}
      traceEnvironment={data.companionTrace.environment}
      observationEnvironment={data.scoreMetadata.environment ?? "default"}
      observationScores={scores}
      traceScores={data.companionTrace.scores}
      actionButtons={actionButtons}
      isActive={isActive}
    />
  ) : (
    <AnnotationForm
      serverScores={scores}
      scoreTarget={target}
      analyticsData={data.analyticsData}
      scoreMetadata={data.scoreMetadata}
      actionButtons={actionButtons}
      isActive={isActive}
    />
  );
}
