import { useRouter } from "next/router";
import Page from "@/src/components/layouts/page";

export default function ExperimentDetail() {
  const router = useRouter();
  const experimentId = router.query.experimentId as string;

  return (
    <Page
      headerProps={{
        title: "Experiment Detail",
        help: {
          description:
            "View and analyze a specific experiment run. See docs to learn more.",
          href: "https://langfuse.com/docs/datasets/experiments",
        },
      }}
    >
      <div className="p-4">
        <p>Experiment Detail View - Coming Soon</p>
        <p>Experiment ID: {experimentId}</p>
      </div>
    </Page>
  );
}
