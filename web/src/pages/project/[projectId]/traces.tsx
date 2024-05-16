import Header from "@/src/components/layouts/header";
import { useRouter } from "next/router";
import TracesTable from "@/src/components/table/use-cases/traces";

export default function Traces() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col overflow-hidden lg:h-[calc(100vh-2rem)]">
      <Header
        title="Traces"
        help={{
          description:
            "A trace represents a single function/api invocation. Traces contain observations. See docs to learn more.",
          href: "https://langfuse.com/docs/tracing",
        }}
      />
      <TracesTable projectId={projectId} />
    </div>
  );
}
