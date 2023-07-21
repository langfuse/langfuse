import { type NestedObservation } from "@/src/utils/types";
import { JSONView } from "@/src/components/ui/code";
import { formatDate } from "@/src/utils/dates";
import Link from "next/link";
import { Fragment, useState } from "react";
import { cn } from "@/src/utils/tailwind";
import { type Observation } from "@prisma/client";

export default function NewObservationDisplay(props: {
  observations: Observation[];
  projectId: string;
}) {
  const [currentObservationId, setCurrentObservationId] = useState<
    string | null
  >(null);
  const nestedObservations = nestObservations(props.observations);

  return (
    <div className="flex flex-col">
      <Observation
        observations={nestedObservations}
        projectId={props.projectId}
        indentationLevel={0}
      />
    </div>
  );
}

const Observation = (props: {
  observations: NestedObservation[];
  projectId: string;
  indentationLevel: number;
}) => (
  <>
    {props.observations
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
      .map((observation) => (
        <Fragment key={observation.id}>
          <div className="flex items-start border-t py-1" key={observation.id}>
            <div className="flex w-1/4">
              <ObservationInfo
                observation={observation}
                projectId={props.projectId}
              />
            </div>

            <div className="ml-4 grid w-3/4 grid-cols-12">
              <div className={`col-span-${props.indentationLevel}`}> </div>

              <div
                className={`flex flex-col col-span-${
                  12 - props.indentationLevel
                } gap-1`}
              >
                {observation.input ? (
                  <JSONView
                    json={observation.input}
                    defaultCollapsed
                    label="Input"
                    className={cn(LevelColor[observation.level].bg)}
                  />
                ) : null}
                {observation.statusMessage ? (
                  <JSONView
                    json={observation.statusMessage}
                    defaultCollapsed
                    label="Status Message"
                    className={cn(LevelColor[observation.level].bg)}
                  />
                ) : null}
                {observation.children.length === 0 && observation.output ? (
                  <JSONView
                    json={observation.output}
                    defaultCollapsed
                    label="Output"
                    className={cn(LevelColor[observation.level].bg)}
                  />
                ) : null}
              </div>
            </div>
          </div>

          <Observation
            observations={observation.children}
            projectId={props.projectId}
            indentationLevel={props.indentationLevel + 1}
          />

          {observation.children.length > 0 && observation.output ? (
            <div
              className="flex items-start border-t py-1"
              key={observation.id}
            >
              <div className="flex w-1/4" />
              <div className="ml-4 grid w-3/4 grid-cols-12">
                <div className={`col-span-${props.indentationLevel}`}> </div>
                <div className={`col-span-${12 - props.indentationLevel}`}>
                  <JSONView
                    json={observation.output}
                    defaultCollapsed
                    label="Output"
                    className={cn(LevelColor[observation.level].bg)}
                  />
                </div>
              </div>
            </div>
          ) : null}
        </Fragment>
      ))}
  </>
);

const ObservationInfo = (props: {
  observation: NestedObservation;
  projectId: string;
}) => {
  return (
    <>
      <div className="flex-auto overflow-hidden break-all ">
        <div className="relative flex flex-col gap-x-4">
          <div className="relative flex py-0.5 text-xs leading-5 text-gray-500">
            {props.observation.type === "GENERATION" ? (
              <Link
                href={`/project/${props.projectId}/generations/${props.observation.id}`}
                className="overflow-hidden font-medium text-gray-900 hover:text-gray-500"
              >
                {props.observation.type}: {props.observation.name} ↗
              </Link>
            ) : (
              <span className="overflow-hidden font-medium text-gray-900">
                {props.observation.type}: {props.observation.name}
              </span>
            )}
          </div>
          {props.observation.startTime ? (
            <div className="flex">
              <time
                dateTime={props.observation.startTime.toString()}
                className="flex-none py-0.5 text-xs leading-5 text-gray-500"
              >
                {formatDate(props.observation.startTime)}
              </time>
              {props.observation.endTime ? (
                <p className="whitespace-nowrap py-0.5 text-xs leading-5 text-gray-500">
                  &nbsp;-&nbsp;
                  {props.observation.endTime.getTime() -
                    props.observation.startTime.getTime()}{" "}
                  ms
                </p>
              ) : undefined}
            </div>
          ) : undefined}
        </div>
        {props.observation.type === "GENERATION" ? (
          <p className="text-xs leading-5 text-gray-500">
            {`${props.observation.promptTokens} → ${props.observation.completionTokens} (∑ ${props.observation.totalTokens})`}
          </p>
        ) : undefined}
        {props.observation.level !== "DEFAULT" ? (
          <div
            className={cn(
              "text-xs leading-5",
              LevelColor[props.observation.level].text
            )}
          >
            {props.observation.level}
          </div>
        ) : null}
      </div>
    </>
  );
};

const LevelColor = {
  DEFAULT: { text: "", bg: "" },
  DEBUG: { text: "text-gray-500", bg: "bg-gray-50" },
  WARNING: { text: "text-yellow-800", bg: "bg-yellow-50" },
  ERROR: { text: "text-red-800", bg: "bg-red-50" },
};

function nestObservations(list: Observation[]): NestedObservation[] {
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

  // Step 4: Return the roots.
  return Array.from(roots.values());
}
