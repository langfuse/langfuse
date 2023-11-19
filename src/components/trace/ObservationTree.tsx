import { type NestedObservation } from "@/src/utils/types";
import { cn } from "@/src/utils/tailwind";
import { type Trace, type Score } from "@prisma/client";
import { GroupedScoreBadges } from "@/src/components/grouped-score-badge";
import { Fragment } from "react";
import { type ObservationReturnType } from "@/src/server/api/routers/traces";

export const ObservationTree = (props: {
  observations: ObservationReturnType[];
  trace: Trace;
  scores: Score[];
  currentObservationId: string | undefined;
  setCurrentObservationId: (id: string | undefined) => void;
}) => {
  const nestedObservations = nestObservations(props.observations);
  return (
    <div className="flex flex-col">
      <ObservationTreeTraceNode
        trace={props.trace}
        scores={props.scores}
        currentObservationId={props.currentObservationId}
        setCurrentObservationId={props.setCurrentObservationId}
      />
      <ObservationTreeNode
        observations={nestedObservations}
        scores={props.scores}
        indentationLevel={1}
        currentObservationId={props.currentObservationId}
        setCurrentObservationId={props.setCurrentObservationId}
      />
    </div>
  );
};
const ObservationTreeTraceNode = (props: {
  trace: Trace & { latency?: number };
  scores: Score[];
  currentObservationId: string | undefined;
  setCurrentObservationId: (id: string | undefined) => void;
}) => (
  <div
    className={cn(
      "group my-1 flex cursor-pointer flex-col gap-1 rounded-sm p-2",
      props.currentObservationId === undefined ||
        props.currentObservationId === ""
        ? "bg-gray-100"
        : "hover:bg-gray-50",
    )}
    onClick={() => props.setCurrentObservationId(undefined)}
  >
    <div className="flex gap-2">
      <span className={cn("rounded-sm bg-gray-200 p-1 text-xs")}>TRACE</span>
      <span>{props.trace.name}</span>
    </div>

    {props.trace.latency ? (
      <div className="flex gap-2">
        <span className="text-xs text-gray-500">
          {props.trace.latency.toFixed(2)} sec
        </span>
      </div>
    ) : null}
    <div className="flex flex-wrap gap-1">
      {props.scores.find((s) => s.observationId === null) ? (
        <GroupedScoreBadges
          scores={props.scores.filter((s) => s.observationId === null)}
        />
      ) : null}
    </div>
  </div>
);
const ObservationTreeNode = (props: {
  observations: NestedObservation[];
  scores: Score[];
  indentationLevel: number;
  currentObservationId: string | undefined;
  setCurrentObservationId: (id: string | undefined) => void;
}) => (
  <>
    {props.observations
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
      .map((observation) => (
        <Fragment key={observation.id}>
          <div className="flex">
            {Array.from({ length: props.indentationLevel }, (_, i) => (
              <div className="mx-2 border-r lg:mr-4" key={i} />
            ))}
            <div
              className={cn(
                "group my-1 flex flex-1 cursor-pointer flex-col gap-1 rounded-sm p-2 ",
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
                <span className="line-clamp-1">{observation.name}</span>
              </div>
              <div className="flex gap-2">
                {observation.endTime ? (
                  <span className="text-xs text-gray-500">
                    {(
                      (observation.endTime.getTime() -
                        observation.startTime.getTime()) /
                      1000
                    ).toFixed(2)}{" "}
                    sec
                  </span>
                ) : null}
                {observation.promptTokens ||
                observation.completionTokens ||
                observation.totalTokens ? (
                  <span className="text-xs text-gray-500">
                    {observation.promptTokens} → {observation.completionTokens}{" "}
                    (∑ {observation.totalTokens})
                  </span>
                ) : null}
              </div>
              {observation.level !== "DEFAULT" ? (
                <div className="flex">
                  <span
                    className={cn(
                      "rounded-sm text-xs",
                      LevelColor[observation.level].bg,
                      LevelColor[observation.level].text,
                    )}
                  >
                    {observation.level}
                  </span>
                </div>
              ) : null}
              {props.scores.find((s) => s.observationId === observation.id) ? (
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
          />
        </Fragment>
      ))}
  </>
);

const LevelColor = {
  DEFAULT: { text: "", bg: "" },
  DEBUG: { text: "text-gray-500", bg: "bg-gray-50" },
  WARNING: { text: "text-yellow-800", bg: "bg-yellow-50" },
  ERROR: { text: "text-red-800", bg: "bg-red-50" },
};

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
