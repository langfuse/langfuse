import { useHasProjectAccess } from "@/src/features/rbac";
import { DrawerContent, DrawerController } from "@/src/components/ui/drawer";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import {
  type AnalyticsData,
  type ScoreTarget,
} from "@/src/features/scores/types";
import { type ReactNode, useEffect, useMemo, useRef } from "react";
import { AnnotateDrawerContent } from "@/src/features/scores/components/AnnotateDrawerContent";
import {
  filterAndValidateDbScoreList,
  ScoreDataTypeArray,
  ScoreDataTypeEnum,
  type ScoreDomain,
} from "@langfuse/shared";
import {
  toDomainArrayWithStringifiedMetadata,
  type WithStringifiedMetadata,
} from "@/src/utils/clientSideDomainTypes";
import { api } from "@/src/utils/api";
import { Button } from "@/src/components/ui/button";

export type AnnotateDrawerControllerProps<Target extends ScoreTarget> = {
  children: (control: {
    disabled: boolean;
    openDrawer: (payload: AnnotateDrawerPayload<Target>) => void;
  }) => ReactNode;
  projectId: string;
};

type AnnotateDrawerState = {
  analyticsData: AnalyticsData;
  scoreMetadata: {
    projectId: string;
    queueId?: string;
    environment?: string;
  };
  scoreTarget: ScoreTarget;
  scores?: WithStringifiedMetadata<ScoreDomain>[];
};

type AnnotateDrawerPayload<Target extends ScoreTarget> =
  Target extends Extract<ScoreTarget, { type: "trace" }>
    ? Omit<AnnotateDrawerState, "scoreTarget" | "scores"> & {
        scoreTarget: Target;
        scores?: WithStringifiedMetadata<ScoreDomain>[];
      }
    : Omit<AnnotateDrawerState, "scoreTarget" | "scores"> & {
        scoreTarget: Target;
        scores: WithStringifiedMetadata<ScoreDomain>[];
      };

function ConnectedAnnotateDrawerContent({
  state,
  capture,
}: {
  state: AnnotateDrawerState;
  capture: ReturnType<typeof usePostHogClientCapture>;
}) {
  const shouldFetchScores =
    state.scores === undefined && state.scoreTarget.type === "trace";
  const scoresQuery = api.events.scoresForTrace.useQuery(
    {
      projectId: state.scoreMetadata.projectId,
      traceId:
        state.scoreTarget.type === "trace" ? state.scoreTarget.traceId : "",
    },
    {
      enabled: shouldFetchScores,
      staleTime: 60 * 1000,
    },
  );
  const fetchedScores = useMemo(() => {
    const scoreTarget = state.scoreTarget;
    if (!scoresQuery.data || scoreTarget.type !== "trace") return;

    const scores = filterAndValidateDbScoreList({
      scores: scoresQuery.data,
      dataTypes: [...ScoreDataTypeArray],
      onParseError: (error) => console.error(error),
    }).filter((score) => {
      if (score.dataType === ScoreDataTypeEnum.CORRECTION) return false;
      if (scoreTarget.observationId) {
        return score.observationId === scoreTarget.observationId;
      }
      return !score.observationId;
    });

    return toDomainArrayWithStringifiedMetadata(scores);
  }, [scoresQuery.data, state.scoreTarget]);
  const scores = state.scores ?? fetchedScores;
  const capturedState = useRef<typeof state>(null);

  useEffect(() => {
    if (state.scores !== undefined || scores === undefined) return;
    if (capturedState.current === state) return;

    capturedState.current = state;
    capture(
      scores.length ? "score:update_form_open" : "score:create_form_open",
      state.analyticsData,
    );
  }, [capture, scores, state]);

  if (scoresQuery.isError && scores === undefined) {
    return (
      <DrawerContent className="flex flex-col gap-3 p-3">
        <p className="text-sm">Could not load scores.</p>
        <Button
          className="self-start"
          onClick={async () => {
            await scoresQuery.refetch();
          }}
        >
          Try again
        </Button>
      </DrawerContent>
    );
  }

  if (scores === undefined) {
    return (
      <DrawerContent className="p-3">
        <p className="text-muted-foreground text-sm">Loading scores...</p>
      </DrawerContent>
    );
  }

  return (
    <AnnotateDrawerContent
      analyticsData={state.analyticsData}
      scoreMetadata={state.scoreMetadata}
      scoreTarget={state.scoreTarget}
      scores={scores}
    />
  );
}

export function AnnotateDrawerController<Target extends ScoreTarget>({
  children,
  projectId,
}: AnnotateDrawerControllerProps<Target>) {
  const capture = usePostHogClientCapture();
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "scores:CUD",
  });
  const disabled = !hasAccess;

  return (
    <DrawerController<AnnotateDrawerState>
      renderContent={({ state }) => (
        <ConnectedAnnotateDrawerContent state={state} capture={capture} />
      )}
    >
      {({ openDrawer }) =>
        children({
          disabled,
          openDrawer: (payload) => {
            if (disabled) return;

            if (payload.scores !== undefined) {
              capture(
                payload.scores.length
                  ? "score:update_form_open"
                  : "score:create_form_open",
                payload.analyticsData,
              );
            }
            openDrawer(payload);
          },
        })
      }
    </DrawerController>
  );
}
