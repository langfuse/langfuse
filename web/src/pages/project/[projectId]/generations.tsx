import Header from "@/src/components/layouts/header";
import { useRouter } from "next/router";
import GenerationsTable from "@/src/components/table/use-cases/generations";
import { FullScreenPage } from "@/src/components/layouts/full-screen-page";

export default function Generations() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  return (
    <FullScreenPage>
      <Header
        title="Generations"
        help={{
          description:
            "A generation captures a single LLM call. It is one type of observation which can be nested in a trace. See docs to learn more.",
          href: "https://langfuse.com/docs/tracing",
        }}
      />
      <GenerationsTable projectId={projectId} />
    </FullScreenPage>
  );
}
