import Header from "@/src/components/layouts/header";

export const SessionPage: React.FC<{ sessionId: string }> = ({ sessionId }) => {
  return (
    <Header
      title="Session"
      breadcrumb={[{ name: "Session" }]}
      help={{
        description:
          "A session is a collection of traces. Add a sessionId to the trace to get started.",
        href: "https://langfuse.com/docs/session",
      }}
    />
  );
};
