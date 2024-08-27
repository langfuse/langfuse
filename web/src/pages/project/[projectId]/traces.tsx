import Header from "@/src/components/layouts/header";
import { useRouter } from "next/router";
import TracesTable from "@/src/components/table/use-cases/traces";
import { FullScreenPage } from "@/src/components/layouts/full-screen-page";
import SetupTracingButton from "@/src/features/setup/components/SetupTracingButton";

export default function Traces() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  return (
    <FullScreenPage>
      <Header
        title="Traces"
        help={{
          description:
            "A trace represents a single function/api invocation. Traces contain observations. See docs to learn more.",
          href: "https://langfuse.com/docs/tracing",
        }}
        actionButtons={<SetupTracingButton />}
      />
      <TracesTable projectId={projectId} />
    </FullScreenPage>
  );
}
