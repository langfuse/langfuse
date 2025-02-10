import { useRouter } from "next/router";
import SessionsTable from "@/src/components/table/use-cases/sessions";
import PageContainer from "@/src/components/layouts/page-container";

export default function Sessions() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  return (
    <PageContainer
      headerProps={{
        title: "Sessions",
        help: {
          description:
            "A session is a collection of related traces, such as a conversation or thread. To begin, add a sessionId to the trace.",
          href: "https://langfuse.com/docs/sessions",
        },
      }}
    >
      <SessionsTable projectId={projectId} />
    </PageContainer>
  );
}
