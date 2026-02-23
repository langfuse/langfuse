import Page from "@/src/components/layouts/page";
import { ExperimentsTable } from "@/src/features/experiments/components/table";
import { useRouter } from "next/router";

export default function Experiments() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

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
      <ExperimentsTable projectId={projectId} />
    </Page>
  );
}
