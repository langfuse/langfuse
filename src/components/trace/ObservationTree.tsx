import { type NestedObservation } from "@/src/utils/types";
import { cn } from "@/src/utils/tailwind";
import { type Trace, type Score } from "@prisma/client";
import { GroupedScoreBadges } from "@/src/components/grouped-score-badge";
import { Fragment } from "react";
import { type ObservationReturnType } from "@/src/server/api/routers/traces";
import { LevelColors } from "@/src/components/level-colors";
import { formatInterval } from "@/src/utils/dates";

export const ObservationTree = (props: {
  observations: ObservationReturnType[];
  trace: Trace;
  scores: Score[];
  currentObservationId: string | undefined;
  setCurrentObservationId: (id: string | undefined) => void;
  showMetrics: boolean;
  showScores: boolean;
  className?: string;
}) => {
  const nestedObservations = nestObservations(props.observations);
  return (
    <div className={props.className}>
      <ObservationTreeTraceNode
        trace={props.trace}
        scores={props.scores}
        currentObservationId={props.currentObservationId}
        setCurrentObservationId={props.setCurrentObservationId}
        showMetrics={props.showMetrics}
        showScores={props.showScores}
      />
      <ObservationTreeNode
        observations={nestedObservations}
        scores={props.scores}
        indentationLevel={1}
        currentObservationId={props.currentObservationId}
        setCurrentObservationId={props.setCurrentObservationId}
        showMetrics={props.showMetrics}
        showScores={props.showScores}
      />
    </div>
  );
};
const ObservationTreeTraceNode = (props: {
  trace: Trace & { latency?: number };
  scores: Score[];
  currentObservationId: string | undefined;
  setCurrentObservationId: (id: string | undefined) => void;
  showMetrics?: boolean;
  showScores?: boolean;
}) => (
  <div
    className={cn(
      "group mb-0.5 flex cursor-pointer flex-col gap-1 rounded-sm p-1.5",
      props.currentObservationId === undefined ||
        props.currentObservationId === ""
        ? "bg-gray-100"
        : "hover:bg-gray-50",
    )}
    onClick={() => props.setCurrentObservationId(undefined)}
  >
    <div className="flex gap-2">
      <span className={cn("rounded-sm bg-gray-200 p-1 text-xs")}>TRACE</span>
      <span className="text-sm">{props.trace.name}</span>
    </div>

    {props.showMetrics && props.trace.latency ? (
      <div className="flex gap-2">
        <span className="text-xs text-gray-500">
          {formatInterval(props.trace.latency)}
        </span>
      </div>
    ) : null}
    {props.showScores && props.scores.find((s) => s.observationId === null) ? (
      <div className="flex flex-wrap gap-1">
        <GroupedScoreBadges
          scores={props.scores.filter((s) => s.observationId === null)}
        />
      </div>
    ) : null}
  </div>
);
const ObservationTreeNode = (props: {
  observations: NestedObservation[];
  scores: Score[];
  indentationLevel: number;
  currentObservationId: string | undefined;
  setCurrentObservationId: (id: string | undefined) => void;
  showMetrics?: boolean;
  showScores?: boolean;
}) => (
  <>
    {props.observations
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
      .map((observation) => (
        <Fragment key={observation.id}>
          <div className="flex">
            {Array.from({ length: props.indentationLevel }, (_, i) => (
              <div className="mx-2 border-r" key={i} />
            ))}
            <div
              className={cn(
                "group my-0.5 flex flex-1 cursor-pointer flex-col gap-1 rounded-sm p-1.5",
                props.currentObservationId === observation.id
                  ? "bg-gray-100"
                  : "hover:bg-gray-50",
              )}
              onClick={() => props.setCurrentObservationId(observation.id)}
            >
              <div className="flex gap-2">
                <span
                  className={cn(
                    "self-start rounded-sm bg-gray-200 p-1 text-xs",
                  )}
                >
                  {observation.type}
                </span>
                <span className="line-clamp-1 text-sm">{observation.name}</span>
              </div>
              {props.showMetrics &&
                (observation.promptTokens ||
                  observation.completionTokens ||
                  observation.totalTokens ||
                  observation.endTime) && (
                  <div className="flex gap-2">
                    {observation.endTime ? (
                      <span className="text-xs text-gray-500">
                        {formatInterval(
                          (observation.endTime.getTime() -
                            observation.startTime.getTime()) /
                            1000,
                        )}
                      </span>
                    ) : null}
                    {observation.promptTokens ||
                    observation.completionTokens ||
                    observation.totalTokens ? (
                      <span className="text-xs text-gray-500">
                        {observation.promptTokens} →{" "}
                        {observation.completionTokens} (∑{" "}
                        {observation.totalTokens})
                      </span>
                    ) : null}
                  </div>
                )}
              {observation.level !== "DEFAULT" ? (
                <div className="flex">
                  <span
                    className={cn(
                      "rounded-sm p-0.5 text-xs",
                      LevelColors[observation.level].bg,
                      LevelColors[observation.level].text,
                    )}
                  >
                    {observation.level}
                  </span>
                </div>
              ) : null}
              {props.showScores &&
              props.scores.find((s) => s.observationId === observation.id) ? (
                <div className="flex flex-wrap gap-1">
                  <GroupedScoreBadges
                    scores={props.scores.filter(
                      (s) => s.observationId === observation.id,
                    )}
                  />
                </div>
              ) : null}
            </div>
          </div>
          <ObservationTreeNode
            observations={observation.children}
            scores={props.scores}
            indentationLevel={props.indentationLevel + 1}
            currentObservationId={props.currentObservationId}
            setCurrentObservationId={props.setCurrentObservationId}
            showMetrics={props.showMetrics}
            showScores={props.showScores}
          />
        </Fragment>
      ))}
  </>
);

export function nestObservations(
  list: ObservationReturnType[],
): NestedObservation[] {
  if (list.length === 0) return [];

  // Step 1: Create a map where the keys are object IDs, and the values are
  // the corresponding objects with an added 'children' property.
  const map = new Map<string, NestedObservation>();
  for (const obj of list) {
    map.set(obj.id, { ...obj, children: [] });
  }

  // Step 2: Create another map for the roots of all trees.
  const roots = new Map<string, NestedObservation>();

  // Step 3: Populate the 'children' arrays and root map.
  for (const obj of map.values()) {
    if (obj.parentObservationId) {
      const parent = map.get(obj.parentObservationId);
      if (parent) {
        parent.children.push(obj);
      }
    } else {
      roots.set(obj.id, obj);
    }
  }

  // TODO sum token amounts per level

  // Step 4: Return the roots.
  return Array.from(roots.values());
}
