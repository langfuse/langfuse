import Header from "@/src/components/layouts/header";
import { useRouter } from "next/router";
import SessionsTable from "@/src/components/table/use-cases/sessions";
import { FullScreenPage } from "@/src/components/layouts/full-screen-page";

export default function Sessions() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  return (
    <FullScreenPage>
      <Header
        title="Sessions"
        help={{
          description:
            "A session is a collection of related traces, such as a conversation or thread. To begin, add a sessionId to the trace.",
          href: "https://langfuse.com/docs/sessions",
        }}
      />

      <SessionsTable projectId={projectId} />
    </FullScreenPage>
  );
}
