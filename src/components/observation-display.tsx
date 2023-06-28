import {
  type GenerationUsage,
  type NestedObservation,
} from "@/src/utils/types";
import { JSONView } from "@/src/components/ui/code";
import { formatDate } from "@/src/utils/dates";
import { Button } from "@/src/components/ui/button";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Fragment } from "react";
import { cn } from "@/src/utils/tailwind";

export default function ObservationDisplay(props: {
  observations: NestedObservation[];
  projectId: string;
}) {
  return (
    <div className="flex flex-col">
      <Observation
        observations={props.observations}
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
  const usage = props.observation.usage
    ? (props.observation.usage as unknown as GenerationUsage)
    : null;
  return (
    <>
      <div className="flex-auto overflow-hidden break-all ">
        <div className="relative flex flex-col justify-between gap-x-4">
          <div className="relative flex py-0.5 text-xs leading-5 text-gray-500">
            <span className="w-full overflow-hidden font-medium text-gray-900">
              {props.observation.type}: {props.observation.name}
            </span>
            {props.observation.type === "GENERATION" ? (
              <Button size="sm" variant="ghost" asChild>
                <Link
                  href={`/project/${props.projectId}/generations/${props.observation.id}`}
                >
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </Button>
            ) : undefined}
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
        {usage && (usage.promptTokens || usage.completionTokens) ? (
          <p className="text-xs leading-5 text-gray-500">
            {(usage.promptTokens ?? 0) + (usage.completionTokens ?? 0)} tokens
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
