import { useRouter } from "next/router";
import { TracePage } from "@/src/components/trace";

export default function PublicTracePage() {
  const router = useRouter();
  const traceId = router.query.traceId as string;
  return (
    <div className="py-5">
      <TracePage traceId={traceId} />
    </div>
  );
}
