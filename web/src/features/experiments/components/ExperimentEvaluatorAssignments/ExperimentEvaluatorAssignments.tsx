import { subDays } from "date-fns";
import { forwardRef, useState } from "react";

import { Skeleton } from "@/src/components/ui/skeleton";
import {
  buildSelectedSampleObject,
  type RuleDraft,
  type RuleEvaluatorOption,
} from "@/src/features/evals";
import { api, sendAsPostOption } from "@/src/utils/api";
import { ExperimentEvaluatorAssignmentsEditor } from "@/src/features/experiments/components/ExperimentEvaluatorAssignments/components/ExperimentEvaluatorAssignmentsEditor/ExperimentEvaluatorAssignmentsEditor";
import { buildExperimentEvaluatorSampleObject } from "@/src/features/experiments/components/ExperimentEvaluatorAssignments/fns/buildExperimentEvaluatorSampleObject";
import type { ExperimentEvaluatorAssignmentsHandle } from "@/src/features/experiments/components/ExperimentEvaluatorAssignments/types/experimentEvaluatorAssignmentsHandle";

type ExperimentEvaluatorAssignmentsProps = {
  projectId: string;
  datasetId: string;
  datasetVersion?: Date;
  evaluatorOptions: RuleEvaluatorOption[];
  initialAssignments: RuleDraft["assignments"];
  search: string;
  onSearchChange: (value: string) => void;
  onSaveAssignments: (assignments: RuleDraft["assignments"]) => Promise<void>;
  disabled?: boolean;
  showSaveButton?: boolean;
};

export const ExperimentEvaluatorAssignments = forwardRef<
  ExperimentEvaluatorAssignmentsHandle,
  ExperimentEvaluatorAssignmentsProps
>(function ExperimentEvaluatorAssignments(props, ref) {
  const [historyStartTime] = useState(() => subDays(new Date(), 7));
  const historicalEvents = api.events.all.useQuery({
    projectId: props.projectId,
    filter: [
      {
        column: "isExperimentItemRootSpan",
        type: "boolean",
        operator: "=",
        value: true,
      },
      {
        column: "experimentDatasetId",
        type: "stringOptions",
        operator: "any of",
        value: [props.datasetId],
      },
      {
        column: "startTime",
        type: "datetime",
        operator: ">=",
        value: historyStartTime,
      },
    ],
    searchQuery: null,
    searchType: ["id", "content"],
    orderBy: { column: "startTime", order: "DESC" },
    page: 1,
    limit: 1,
  });
  const historicalObservation = historicalEvents.data?.observations[0];
  const sampleItem = api.datasets.itemsByDatasetId.useQuery(
    {
      projectId: props.projectId,
      datasetId: props.datasetId,
      filter: [],
      page: 0,
      limit: 1,
      version: props.datasetVersion,
    },
    {
      enabled: !historicalEvents.isPending && !historicalObservation,
    },
  );
  const historicalEventDetails = api.events.experimentBatchIO.useQuery(
    {
      projectId: props.projectId,
      observations: [
        {
          id: historicalObservation?.id ?? "",
          traceId: historicalObservation?.traceId ?? "",
        },
      ],
      minStartTime: historicalObservation?.startTime ?? new Date(0),
      maxStartTime: historicalObservation?.startTime ?? new Date(0),
      truncated: false,
      includeToolCalls: true,
    },
    {
      ...sendAsPostOption,
      enabled: Boolean(
        historicalObservation?.id &&
        historicalObservation.traceId &&
        historicalObservation.startTime,
      ),
    },
  );

  if (
    historicalEvents.isPending ||
    (historicalObservation
      ? historicalEventDetails.isPending
      : sampleItem.isPending)
  ) {
    return <Skeleton className="h-20 w-full" />;
  }

  const historicalSample = buildSelectedSampleObject({
    observation: historicalObservation ?? null,
    eventDetails: historicalEventDetails.data?.[0],
  });
  const sampleObject = buildExperimentEvaluatorSampleObject(
    sampleItem.data?.datasetItems[0],
    historicalSample,
  );

  return (
    <ExperimentEvaluatorAssignmentsEditor
      ref={ref}
      key={JSON.stringify(props.initialAssignments)}
      {...props}
      sampleObject={sampleObject}
      unvalidatedSourceColumnIds={historicalObservation ? [] : ["output"]}
    />
  );
});
