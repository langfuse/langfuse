import Header from "@/src/components/layouts/header";
import { useRouter } from "next/router";

export const SessionPage: React.FC<{ sessionId: string }> = ({ sessionId }) => {
  const router = useRouter();
  return (
    <Header
      title="Session"
      breadcrumb={[
        {
          name: "Sessions",
          href: `/project/${router.query.projectId as string}/sessions`,
        },
        { name: sessionId },
      ]}
      help={{
        description:
          "A session is a collection of traces. Add a sessionId to the trace to get started.",
        href: "https://langfuse.com/docs/session",
      }}
    />
  );
};
