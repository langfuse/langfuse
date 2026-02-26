import Page from "@/src/components/layouts/page";
import { ExperimentsTable } from "@/src/features/experiments/components/table";
import useIsExperimentV4Enabled from "@/src/features/feature-flags/hooks/useIsExperimentV4Enabled";
import { useRouter } from "next/router";

export default function Experiments() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  const { isEnabled } = useIsExperimentV4Enabled();

  return (
    <Page
      headerProps={{
        title: "Experiments",
        help: {
          description:
            "Experiments allow you to compare and analyze different runs of your LLM application. See docs to learn more.",
          href: "https://langfuse.com/docs/datasets/experiments",
        },
      }}
    >
      {isEnabled ? (
        <ExperimentsTable projectId={projectId} />
      ) : (
        <div className="p-4">
          <p>Experiments List View - Coming Soon</p>
        </div>
      )}
    </Page>
  );
}
