import { useRouter } from "next/router";
import TracesTable from "@/src/components/table/use-cases/traces";
import SetupTracingButton from "@/src/features/setup/components/SetupTracingButton";
import PageContainer from "@/src/components/layouts/page-container";

export default function Traces() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  return (
    <PageContainer
      headerProps={{
        title: "Traces",
        help: {
          description:
            "A trace represents a single function/api invocation. Traces contain observations. See docs to learn more.",
          href: "https://langfuse.com/docs/tracing",
        },
        actionButtonsRight: <SetupTracingButton />,
      }}
    >
      <TracesTable projectId={projectId} />
    </PageContainer>
  );
}
