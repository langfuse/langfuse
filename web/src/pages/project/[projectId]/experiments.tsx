import { useRouter } from "next/router";
import Page from "@/src/components/layouts/page";

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
      scrollable
    >
      <div className="p-4">
        <p>Experiments List View - Coming Soon</p>
        <p>Project ID: {projectId}</p>
      </div>
    </Page>
  );
}
