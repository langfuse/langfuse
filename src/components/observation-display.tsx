import {
  type GenerationUsage,
  type NestedObservation,
} from "@/src/utils/types";
import { JSONView } from "@/src/components/ui/code";
import { type Prisma } from "@prisma/client";
import { formatDate } from "@/src/utils/dates";
import { Button } from "@/src/components/ui/button";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

type RowData = {
  id: string;
  name: string | null;
  level: number;
  input: Prisma.JsonValue;
  output: Prisma.JsonValue;
  usage: Prisma.JsonValue;
  startTime: Date;
  endTime: Date | null;
  showOutput: boolean;
  type: string;
};

function getObservationsAndLevels(
  observation: NestedObservation,
  level = 0,
  showOutput = false
): RowData[] {
  const result: RowData[] = [
    {
      id: observation.id,
      name: observation.name,
      input: observation.input,
      output: observation.output,
      startTime: observation.startTime,
      endTime: observation.endTime,
      type: observation.type,
      usage: observation.usage,
      showOutput,
      level,
    },
  ];

  if (observation.children) {
    observation.children
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
      .map((child) => getObservationsAndLevels(child, level + 1))
      .map((childResult) => result.push(...childResult));
  }

  result.push({
    id: observation.id,
    name: observation.name,
    input: observation.input,
    output: observation.output,
    startTime: observation.startTime,
    endTime: observation.endTime,
    type: observation.type,
    usage: observation.usage,
    showOutput: true,
    level,
  });

  return result;
}

export default function ObservationDisplay(props: {
  observations: NestedObservation[];
  projectId: string;
  indentationLevel: number;
}) {
  const flatMap = props.observations
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
    .flatMap((o) => getObservationsAndLevels(o, 0));

  return (
    <div>
      <div className="">
        <div className="flex flex-col">
          {flatMap.map((row) => (
            <div
              className="mt-4 flex items-start"
              key={row.showOutput ? row.id + "output" : row.id}
            >
              <div className=" flex w-1/4  overflow-hidden">
                {!row.showOutput ? (
                  <ObservationInfo
                    observation={row}
                    projectId={props.projectId}
                  />
                ) : undefined}
              </div>
              <div className="ml-4 grid w-3/4 grid-cols-12">
                <div className={`col-span-${row.level}`}> </div>

                <div className={`col-span-${12 - row.level}`}>
                  {row.showOutput && row.output ? (
                    <JSONView json={row.output} defaultCollapsed />
                  ) : undefined}
                  {row.showOutput && !row.output ? (
                    <h3 className="m-5 text-base font-medium leading-4 text-gray-900">
                      No Output
                    </h3>
                  ) : undefined}
                  {!row.showOutput && row.input ? (
                    <JSONView json={row.input} defaultCollapsed />
                  ) : undefined}
                  {!row.showOutput && !row.input ? (
                    <h3 className="m-5 text-base font-medium leading-4 text-gray-900">
                      No Input
                    </h3>
                  ) : undefined}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const ObservationInfo = (props: {
  observation: RowData;
  projectId: string;
}) => {
  const usage = props.observation.usage
    ? (props.observation.usage as unknown as GenerationUsage)
    : null;
  return (
    <>
      <div className="flex-auto overflow-hidden break-all rounded-md p-3 ring-1 ring-inset ring-gray-200">
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
                <>
                  <p className="whitespace-nowrap py-0.5 text-xs leading-5 text-gray-500">
                    &nbsp;-&nbsp;
                    {props.observation.endTime.getTime() -
                      props.observation.startTime.getTime()}{" "}
                    ms
                  </p>
                </>
              ) : undefined}
            </div>
          ) : undefined}
        </div>
        {usage && (usage.promptTokens || usage.completionTokens) ? (
          <p className="text-xs leading-5 text-gray-500">
            {(usage.promptTokens ?? 0) + (usage.completionTokens ?? 0)} tokens
          </p>
        ) : undefined}
      </div>
    </>
  );
};
