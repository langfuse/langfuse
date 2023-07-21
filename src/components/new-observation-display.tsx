import { type NestedObservation } from "@/src/utils/types";
import { JSONView } from "@/src/components/ui/code";
import { formatDate } from "@/src/utils/dates";
import Link from "next/link";
import { Fragment } from "react";
import { cn } from "@/src/utils/tailwind";
import { type Trace, type Observation, type Score } from "@prisma/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { useRouter } from "next/router";

export default function TraceDisplay(props: {
  observations: Observation[];
  trace: Trace;
  scores: Score[];
  projectId: string;
}) {
  const router = useRouter();
  const currentObservationId = router.query.observation as string | undefined;
  const setCurrentObservationId = (id: string | undefined) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { observation, ...query } = router.query;
    void router.replace(
      {
        pathname: router.pathname,
        query: {
          ...query,
          ...(id !== undefined ? { observation: id } : {}),
        },
      },
      undefined,
      {
        scroll: false,
      }
    );
  };

  console.log("currentObservationId", currentObservationId);

  return (
    <div className="flex flex-col gap-8 md:flex-row-reverse">
      <ObservationTree
        observations={props.observations}
        trace={props.trace}
        scores={props.scores}
        currentObservationId={currentObservationId}
        setCurrentObservationId={setCurrentObservationId}
      />

      {currentObservationId === undefined || currentObservationId === "" ? (
        <TracePreview trace={props.trace} projectId={props.projectId} />
      ) : (
        <ObservationPreview
          observations={props.observations}
          projectId={props.projectId}
          currentObservationId={currentObservationId}
        />
      )}
    </div>
  );
}

const ObservationTree = (props: {
  observations: Observation[];
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
  trace: Trace;
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
        : "hover:bg-gray-50"
    )}
    onClick={() => props.setCurrentObservationId(undefined)}
  >
    <div className="flex gap-2">
      <span className={cn("rounded-sm bg-gray-200 p-1 text-xs")}>TRACE</span>
      <span>{props.trace.name}</span>
    </div>
    <div className="flex gap-2">
      <span className="text-xs text-gray-500">
        {formatDate(props.trace.timestamp)}
      </span>
    </div>
    {props.scores.find((s) => s.observationId === null) ? (
      <div className="flex flex-wrap gap-2">
        {props.scores
          .filter((s) => s.observationId === null)
          .map((s) => (
            <Badge variant="outline" key={s.id}>
              {s.name}: {s.value}
            </Badge>
          ))}
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
}) => (
  <>
    {props.observations
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
      .map((observation) => (
        <>
          <div className="flex">
            {Array.from({ length: props.indentationLevel }, (_, i) => (
              <div className="mx-2 border-r" key={i}>
                {/* <div className=" h-full border-r" /> */}
              </div>
            ))}
            <div
              key={observation.id}
              className={cn(
                "group my-1 flex flex-1 cursor-pointer flex-col gap-1 rounded-sm p-2 ",
                props.currentObservationId === observation.id
                  ? "bg-gray-100"
                  : "hover:bg-gray-50"
              )}
              onClick={() => props.setCurrentObservationId(observation.id)}
            >
              <div className="flex gap-2">
                <span className={cn("rounded-sm bg-gray-200 p-1 text-xs")}>
                  {observation.type}
                </span>
                <span>{observation.name}</span>
              </div>
              <div className="flex gap-2">
                {observation.endTime ? (
                  <span className="text-xs text-gray-500">
                    {observation.endTime.getTime() -
                      observation.startTime.getTime()}{" "}
                    ms
                  </span>
                ) : null}
                <span className="text-xs text-gray-500">
                  {observation.promptTokens} → {observation.completionTokens} (∑{" "}
                  {observation.totalTokens})
                </span>
              </div>
              {observation.level !== "DEFAULT" ? (
                <div className="flex">
                  <span
                    className={cn(
                      "rounded-sm text-xs",
                      LevelColor[observation.level].bg,
                      LevelColor[observation.level].text
                    )}
                  >
                    {observation.level}
                  </span>
                </div>
              ) : null}
              {props.scores.find((s) => s.observationId === observation.id) ? (
                <div className="flex flex-wrap gap-2">
                  {props.scores
                    .filter((s) => s.observationId === observation.id)
                    .map((s) => (
                      <Badge variant="outline" key={s.id}>
                        {s.name}: {s.value}
                      </Badge>
                    ))}
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
        </>
      ))}
  </>
);

const ObservationPreview = (props: {
  observations: Observation[];
  projectId: string;
  currentObservationId: string | undefined;
}) => {
  const observation = props.observations.find(
    (o) => o.id === props.currentObservationId
  );
  if (!observation) return <div className="flex-1">Not found</div>;
  return (
    <Card className="flex-1">
      <CardHeader>
        <CardTitle>
          <span className="mr-2 rounded-sm bg-gray-200 p-1 text-xs">
            {observation.type}
          </span>
          <span>{observation.name}</span>
        </CardTitle>
        <CardDescription className="flex gap-2">
          {observation.startTime.toLocaleString()}
        </CardDescription>
        <div className="flex flex-wrap gap-2">
          {observation.endTime ? (
            <Badge variant="outline">
              {`${
                observation.endTime.getTime() - observation.startTime.getTime()
              } ms`}
            </Badge>
          ) : null}
          <Badge variant="outline">
            {observation.promptTokens} prompt → {observation.completionTokens}{" "}
            completion (∑ {observation.totalTokens})
          </Badge>
          {observation.model ? (
            <Badge variant="outline">{observation.model}</Badge>
          ) : null}
          {observation.modelParameters &&
          typeof observation.modelParameters === "object"
            ? Object.entries(observation.modelParameters)
                .filter(Boolean)
                .map(([key, value]) => (
                  <Badge variant="outline" key={key}>
                    {key}: {value?.toString()}
                  </Badge>
                ))
            : null}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <JSONView
          title={observation.type === "GENERATION" ? "Prompt" : "Input"}
          json={observation.input}
          scrollable
        />
        <JSONView
          title={observation.type === "GENERATION" ? "Completion" : "Output"}
          json={observation.output}
          scrollable
        />
        <JSONView title="Status Message" json={observation.statusMessage} />
        <JSONView title="Metadata" json={observation.metadata} />
      </CardContent>
    </Card>
  );
};

const TracePreview = (props: { trace: Trace; projectId: string }) => {
  const { trace, projectId } = props;
  return (
    <Card className="flex-1">
      <CardHeader>
        <CardTitle>
          <span className="mr-2 rounded-sm bg-gray-200 p-1 text-xs">TRACE</span>
          <span>{trace.name}</span>
        </CardTitle>
        <CardDescription>{trace.timestamp.toLocaleString()}</CardDescription>
      </CardHeader>
      <CardContent>
        <JSONView title="Metadata" json={trace.metadata} scrollable />
      </CardContent>
      <CardFooter></CardFooter>
    </Card>
  );
};

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
                    title="Input"
                    className={cn(LevelColor[observation.level].bg)}
                  />
                ) : null}
                {observation.statusMessage ? (
                  <JSONView
                    json={observation.statusMessage}
                    defaultCollapsed
                    title="Status Message"
                    className={cn(LevelColor[observation.level].bg)}
                  />
                ) : null}
                {observation.children.length === 0 && observation.output ? (
                  <JSONView
                    json={observation.output}
                    defaultCollapsed
                    title="Output"
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
                    title="Output"
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

  // TODO sum token amounts per level

  // Step 4: Return the roots.
  return Array.from(roots.values());
}
