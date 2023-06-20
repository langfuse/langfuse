import { Button } from "@/src/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/src/components/ui/collapsible";
import { ChevronsUpDown, ChevronsDownUp, ArrowUpRight } from "lucide-react";
import { useState } from "react";
import { type NestedObservation } from "@/src/utils/types";
import Link from "next/link";
import { JSONview } from "@/src/components/ui/code";

export default function ObservationDisplay(props: {
  obs: NestedObservation;
  projectId: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div>
      <Collapsible open={isOpen} onOpenChange={setIsOpen} className="space-y-2">
        <div className="flex items-center space-x-2">
          <span className=" text-xs text-gray-500">{props.obs.type}:</span>
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
          {props.obs.type === "GENERATION" ? (
            <Button size="sm" variant="ghost" asChild>
              <Link
                href={`/project/${props.projectId}/generations/${props.obs.id}`}
              >
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </Button>
          ) : null}
        </div>
        <CollapsibleContent>
          <div className="mb-4 space-y-2">
            <span className="text-sm font-semibold">Metadata</span>
            <JSONview json={props.obs.metadata} />
          </div>
        </CollapsibleContent>
      </Collapsible>
      <div className="ml-5">
        {props.obs.children.map((obs) => (
          <ObservationDisplay
            key={obs.name}
            obs={obs}
            projectId={props.projectId}
          />
        ))}
      </div>
    </div>
  );
}
