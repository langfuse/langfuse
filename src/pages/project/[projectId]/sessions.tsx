import Header from "@/src/components/layouts/header";
import { useRouter } from "next/router";
import SessionsTable from "@/src/components/table/use-cases/sessions";

export default function Sessions() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  return (
    <div>
      <Header
        title="Sessions"
        help={{
          description:
            "A session is a collection of traces, for example a conversation/thread. Add a sessionId to the trace to get started.",
          href: "https://langfuse.com/docs/session",
        }}
      />

      <SessionsTable projectId={projectId} />
    </div>
  );
}
