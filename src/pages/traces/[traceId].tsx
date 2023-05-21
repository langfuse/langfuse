import { useRouter } from "next/router";
import Header from "~/components/layouts/header";
import { Button } from "~/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible";
import { api } from "~/utils/api";
import { ChevronsUpDown, ChevronsDownUp, ArrowUpRight } from "lucide-react";
import { useState } from "react";
import { type NestedObservation } from "@/src/utils/types";
import Link from "next/link";
import DescriptionList from "@/src/components/ui/descriptionLists";
import { JSONview } from "@/src/components/ui/code";

export default function TracePage() {
  const router = useRouter();
  const { traceId } = router.query;

  const trace = api.traces.byId.useQuery(traceId as string, {
    enabled: traceId !== undefined,
  });

  return (
    <>
      <Header
        title="Trace Detail"
        breadcrumb={[
          { name: "Traces", href: "/traces" },
          { name: traceId as string },
        ]}
      />
      {trace.data ? (
        <DescriptionList
          items={[
            {
              label: "Timestamp",
              value: trace.data.timestamp.toLocaleString(),
            },
            {
              label: "Name",
              value: trace.data.name,
            },
            {
              label: "Status",
              value:
                trace.data.status +
                (trace.data.statusMessage
                  ? ` (${trace.data.statusMessage})`
                  : ""),
            },
            {
              label: "Attributes",
              value: (
                <span className="font-mono">
                  {JSON.stringify(trace.data.attributes, null, 2)}
                </span>
              ),
            },
            {
              label: "Detailed trace",
              value: (
                <div className="space-y-2">
                  {trace.data?.nestedObservations.map((obs) => (
                    <ObservationDisplay key={obs.id} obs={obs} />
                  )) ?? null}
                </div>
              ),
            },
          ]}
        />
      ) : null}
    </>
  );
}

function ObservationDisplay(props: { obs: NestedObservation }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div>
      <Collapsible open={isOpen} onOpenChange={setIsOpen} className="space-y-2">
        <div className="flex items-center  space-x-2 px-4">
          <span className="p-2 text-xs text-gray-500">{props.obs.type}:</span>
          <h4 className="text-sm font-semibold">{props.obs.name}</h4>
          {props.obs.endTime ? (
            <span className="text-gray-500">{`${
              props.obs.endTime.getTime() - props.obs.startTime.getTime()
            } ms`}</span>
          ) : null}
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-9 p-0">
              {isOpen ? (
                <ChevronsDownUp className="h-4 w-4" />
              ) : (
                <ChevronsUpDown className="h-4 w-4" />
              )}
              <span className="sr-only">Toggle</span>
            </Button>
          </CollapsibleTrigger>
          {props.obs.type === "LLMCALL" ? (
            <Button size="sm" variant="ghost" asChild>
              <Link href={`/llm-calls/${props.obs.id}`}>
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </Button>
          ) : null}
        </div>
        <CollapsibleContent className="ml-6  space-y-2">
          <span className="text-sm font-semibold">Attributes</span>
          <JSONview json={props.obs.attributes} />
        </CollapsibleContent>
      </Collapsible>
      <div className="ml-5">
        {props.obs.children.map((obs) => (
          <ObservationDisplay key={obs.name} obs={obs} />
        ))}
      </div>
    </div>
  );
}
