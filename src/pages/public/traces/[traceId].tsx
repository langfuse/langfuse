import { useRouter } from "next/router";
import { api } from "@/src/utils/api";
import { TracePage } from "@/src/components/trace";

export default function PublicTracePage() {
  const router = useRouter();
  const traceId = router.query.traceId as string;

  const trace = api.traces.byIdPublic.useQuery(traceId);

  if (trace.isLoading) return <div>loading...</div>;
  if (trace.data) {
    return (
      <div className="py-5">
        <TracePage trace={trace.data} />
      </div>
    );
  } else {
    return <div>Not available</div>;
  }
}
