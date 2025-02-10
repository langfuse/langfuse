import { useRouter } from "next/router";
import ObservationsTable from "@/src/components/table/use-cases/observations";
import PageContainer from "@/src/components/layouts/page-container";

export default function Generations() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  return (
    <PageContainer
      headerProps={{
        title: "Observations",
        help: {
          description:
            "An observation captures a single function call in an application. See docs to learn more.",
          href: "https://langfuse.com/docs/tracing",
        },
      }}
    >
      <ObservationsTable projectId={projectId} />
    </PageContainer>
  );
}
