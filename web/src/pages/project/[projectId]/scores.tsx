import Header from "@/src/components/layouts/header";

import { useRouter } from "next/router";
import ScoresTable from "@/src/components/table/use-cases/scores";

export default function ScoresPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col overflow-hidden lg:h-[calc(100vh-2rem)]">
      <Header
        title="Scores"
        help={{
          description:
            "A scores is an evaluation of a traces or observations. It can be created from user feedback, model-based evaluations, or manual review. See docs to learn more.",
          href: "https://langfuse.com/docs/scores",
        }}
      />
      <ScoresTable projectId={projectId} />
    </div>
  );
}
