import Header from "@/src/components/layouts/header";
import ObservationDisplay from "@/src/components/observationDisplay";
import { Button } from "@/src/components/ui/button";
import DescriptionList from "@/src/components/ui/descriptionLists";
import { api } from "@/src/utils/api";
import { type RouterOutput } from "@/src/utils/types";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

export default function SideBySide() {
  const traces = api.traces.all.useQuery();

  return (
    <>
      <Header title="Side-by-side" />
      <span className="text-2xl font-bold">Traces</span>
      <div className="relative flex max-w-full flex-row gap-2 overflow-x-scroll py-5">
        {traces.data?.map((trace) => (
          <Single key={trace.id} trace={trace} />
        ))}
        {traces.data?.map((trace) => (
          <Single key={trace.id} trace={trace} />
        ))}
        {traces.data?.map((trace) => (
          <Single key={trace.id} trace={trace} />
        ))}
        {traces.data?.map((trace) => (
          <Single key={trace.id} trace={trace} />
        ))}
      </div>
    </>
  );
}

const Single = (props: { trace: RouterOutput["traces"]["all"][number] }) => {
  const { trace } = props;

  if (trace.nestedObservation)
    return (
      <div className="w-[550px] flex-none rounded-md border px-3">
        <div className="mt-4 font-bold">Trace</div>
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/traces/${trace.id}`}>
            {trace.id}
            <ArrowUpRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
        <div className="mt-4 text-sm font-bold">Timestamp</div>
        <div>{trace.timestamp.toLocaleString()}</div>
        <div className="mt-4 text-sm font-bold">Name</div>
        <div>{trace.name}</div>
        <div className="mt-4 text-sm font-bold">Observations:</div>
        <ObservationDisplay key={trace.id} obs={trace.nestedObservation} />
      </div>
    );
  else return null;
};
