import Header from "@/src/components/layouts/header";
import { PromptTable } from "@/src/features/prompts/components/prompts-table";
import { useRouter } from "next/router";

export default function Alerts() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  return (
    <div>
      <Header title="Prompts" />
      <PromptTable projectId={projectId} />
    </div>
  );
}
