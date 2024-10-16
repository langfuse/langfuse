import { useRouter } from "next/router";
import { TracePage } from "@/src/components/trace";

export default function Trace() {
  const router = useRouter();
  const traceId = decodeURIComponent(router.query.traceId as string);

  return <TracePage traceId={traceId} />;
}
