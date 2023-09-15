import { useRouter } from "next/router";
import { api } from "@/src/utils/api";
import { TracePage } from "@/src/components/trace";

export default function Trace() {
  const router = useRouter();
  const traceId = router.query.traceId as string;
  const trace = api.traces.byId.useQuery(traceId);

  if (trace.data) {
    return <TracePage trace={trace.data} />;
  } else {
    return <div>loading...</div>;
  }
}
