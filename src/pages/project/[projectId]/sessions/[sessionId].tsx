import { useRouter } from "next/router";
import { SessionPage } from "@/src/components/session";

export default function Trace() {
  const router = useRouter();
  const sessionId = router.query.sessionId as string;

  return <SessionPage sessionId={sessionId} />;
}
