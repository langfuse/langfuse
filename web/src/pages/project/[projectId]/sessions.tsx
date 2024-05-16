import Header from "@/src/components/layouts/header";
import { useRouter } from "next/router";
import SessionsTable from "@/src/components/table/use-cases/sessions";

export default function Sessions() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col overflow-hidden lg:h-[calc(100vh-2rem)]">
      <Header
        title="Sessions"
        help={{
          description:
            "A session is a collection of related traces, such as a conversation or thread. To begin, add a sessionId to the trace.",
          href: "https://langfuse.com/docs/sessions",
        }}
      />

      <SessionsTable projectId={projectId} />
    </div>
  );
}
