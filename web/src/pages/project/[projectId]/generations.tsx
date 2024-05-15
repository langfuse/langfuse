import Header from "@/src/components/layouts/header";
import { useRouter } from "next/router";
import GenerationsTable from "@/src/components/table/use-cases/generations";

export default function Generations() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col overflow-hidden md:h-[calc(100vh-2rem)]">
      <Header
        title="Generations"
        help={{
          description:
            "A generation captures a single LLM call. It is one type of observation which can be nested in a trace. See docs to learn more.",
          href: "https://langfuse.com/docs/tracing",
        }}
      />
      <GenerationsTable projectId={projectId} />
    </div>
  );
}
