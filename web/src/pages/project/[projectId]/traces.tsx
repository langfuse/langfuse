import { useRouter } from "next/router";
import TracesTable from "@/src/components/table/use-cases/traces";
import SetupTracingButton from "@/src/features/setup/components/SetupTracingButton";
import Page from "@/src/components/layouts/page";

export default function Traces() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  return (
    <Page
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
    </Page>
  );
}
